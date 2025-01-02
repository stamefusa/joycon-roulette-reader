import { HID, HIDAsync, devices as findHIDDevices, devicesAsync } from 'node-hid';
import { EventEmitter } from 'events';
import * as SC from './subcommand.js';
import * as IR from './reports.js';
import { Byte } from './common.js';
import { ExternalDevice } from './devices/base.js';
import { setTimeout as sleep } from 'timers/promises';
import { Rumble } from './rumble.js';
import * as winston from 'winston';

// JoyCon R
const VENDOR_ID = 1406;
const PRODUCT_ID = 8199;

const EXT_DEVICE_CONNECTED = 'ext_device_connected';
const EXT_DEVICE_DISCONNECTED = 'ext_device_disconnected';

interface DeviceInfo {
    vendorId: number;
    productId: number;
}

enum ExternalDeviceType {
    RINGCON = 0x20,
    ROULETTE = 0x29
}

export enum DeviceType {
    JOYCON_L = 0x01,
    JOYCON_R = 0x02,
    PRO_CONTROLLER = 0x03
}

function convertByteToHexString(id: Byte): string {
    return ('00' + id).slice(-2);
}

class Joycon extends EventEmitter {
    private device: HIDAsync | null = null;
    private packetNumber: number = 0;
    private previousState: IR.StandardReportBase | null = null;
    private initialized: boolean = false;

    private _serialNumber: string = '';
    private _deviceType: DeviceType | null = null;
    private _firmwareVersion: string = '';
    private _logger: winston.Logger;

    private commandQueue: Array<() => Promise<number>> = [];
    private isProcessingQueue: boolean = false;
    private rumbleQueue: Array<number[]> = [];
    private isSendingRumble: boolean = false;

    constructor(opts: { logger?: winston.Logger }) {
        super();
        this._logger =
            opts.logger ||
            winston.createLogger({
                level: 'fatal',
                format: winston.format.simple(),
                transports: []
            });
    }

    static async findDevices(): Promise<DeviceInfo[]> {
        const devices = await devicesAsync();
        for (const device of devices) {
            //
            if (device.vendorId === VENDOR_ID && device.productId === PRODUCT_ID) {
                // tentatively returns the first device only
                return [device];
            }
        }
        return [];
    }

    get logger(): winston.Logger {
        return this._logger;
    }

    async openDevice(deviceInfo: DeviceInfo): Promise<boolean> {
        if (this.device !== null) {
            return false;
        }

        try {
            this.device = await HIDAsync.open(deviceInfo.vendorId, deviceInfo.productId);
            this.device.on('data', this.dataReceived.bind(this));
            this.device.on('error', this.onError.bind(this));

            await this.initializeDevice();
        } catch (err) {
            this.logger.error(err, 'Error opening device');
            return false;
        }

        return Promise.resolve(true);
    }

    private async initializeDevice() {
        await this.sendSubcommandAndWaitAsync(new SC.Shipment(0));
        const di = (await this.sendSubcommandAndWaitAsync(new SC.DeviceInfoRequest())) as SC.DeviceInfoResponse;

        this._firmwareVersion = di.firmwareVersion;
        this._deviceType = di.type;

        await this.readSPIData();

        // Set input mode: standard full @60Hz
        await this.sendSubcommandAndWaitAsync(new SC.SetInputReportModeRequest(SC.InputReportMode.STANDARD_FULL));
        // Set trigger button elapsed time
        await this.sendSubcommandAndWaitAsync(new SC.TriggerButtonElapsedTimeRequest(0));
        // Enable IMU
        await this.sendSubcommandAndWaitAsync(new SC.EnableIMU6AxisSensorRequest(2));
        // Enable vibration
        await this.sendSubcommandAndWaitAsync(new SC.EnableVibrationRequest(true));
        // Resume MCU / Set MCU state
        await this.sendSubcommandAndWaitAsync(new SC.SetMCUStateRequest(SC.MCUState.RESUME));
        // Set LEDs
        await this.sendSubcommandAndWaitAsync(new SC.SetPlayerLightsRequest(SC.LightPosition.ONE));
        // MCU data 21 21 0 0
        await this.sendSubcommandAndWaitAsync(new SC.ConfigureMCURequest(0x21, 0, 0));
        await this.sendSubcommandAndWaitAsync(new SC.SetMCUStateRequest(SC.MCUState.SUSPEND));

        this.initialized = true;
    }

    private async readSPIData(): Promise<void> {
        const serialNumber = (await this.sendSubcommandAndWaitAsync(
            new SC.ReadSPI(0x6000, 0x10)
        )) as SC.ReadSPIResponse;

        if (serialNumber[0] > 0x80) {
            this._serialNumber = '';
        } else {
            this._serialNumber = serialNumber.SPIData.toString('ascii');
        }

        this.logger.info(`Serial number: ${this._serialNumber}`);

        const colors = (await this.sendSubcommandAndWaitAsync(new SC.ReadSPI(0x6050, 0x0d))) as SC.ReadSPIResponse;
        this.logger.info(
            `Body color: ${colors.SPIData.subarray(0, 3).toString('hex')}, ` +
                `Button color: ${colors.SPIData.subarray(3, 6).toString('hex')}, ` +
                `Grip(L): ${colors.SPIData.subarray(6, 9).toString('hex')}, ` +
                `Grip(R): ${colors.SPIData.subarray(9, 12).toString('hex')}`
        );

        await this.sendSubcommandAndWaitAsync(new SC.ReadSPI(0x6080, 0x18));
        await this.sendSubcommandAndWaitAsync(new SC.ReadSPI(0x8010, 0x18));
        await this.sendSubcommandAndWaitAsync(new SC.ReadSPI(0x603d, 0x19));
        await this.sendSubcommandAndWaitAsync(new SC.ReadSPI(0x6020, 0x18));
    }

    close(): void {
        this.emit('disconnected');
        if (this.device !== null) {
            this.device.close();
        }

        this.device = null;
    }

    private dataReceived(data: Buffer): void {
        const type = data.readUInt8(0);

        switch (type) {
            case 0x21:
                this.processStandard(new IR.StandardReport(data));
                return;
            case 0x30:
                this.processStandardFull(new IR.StandardFullReport(data));
                return;
            case 0x31:
                this.processMCU(new IR.MCUReport(data));
                break;
            case 0x63:
                this.logger.warn('Maybe reconnect request?', type, data);
                break;
            default:
                this.logger.warn('Not implemented: ', type, data);
        }
    }

    private async findExternalDevice(): Promise<boolean> {
        this.logger.verbose('finding external device');

        try {
            let result: SC.SubCommandReply = await this.sendSubcommandAndWaitAsync(
                new SC.SetMCUStateRequest(SC.MCUState.RESUME)
            );

            // Enable MCU ext device and wait for status
            for (let i = 0; i < 100; i++) {
                result = await this.sendSubcommandAndWaitAsync(new SC.ConfigureMCURequest(0x21, 0, 3));
                if (result.data[0] == 0xff && result.data[1] == 0xff) {
                    // Probably the device is not connected
                    return false;
                }
                if (result.data[0] == 0x01 && result.data[1] == 0x32) {
                    if (result.data[7] == 0x03) {
                        // Probably the device is ready
                        this.logger.verbose('device ready');
                        break;
                    }
                }

                await sleep(150);
            }

            await this.sendSubcommandAndWaitAsync(new SC.ConfigureMCURequest(0x21, 1, 1));
            await sleep(300);

            result = await this.sendSubcommandAndWaitAsync(new SC.GetExternalDeviceInfo());
            await sleep(200);

            if (result.data[0] == 0) {
                const deviceType = result.data[1] as ExternalDeviceType;
                this.emit(EXT_DEVICE_CONNECTED, deviceType);
            } else {
                this.logger.error('Failed to initialize external device:', result.data[0]);
                return false;
            }
        } catch (e) {
            this.logger.error('Error initializing external device', e);
            return false;
        }
    }

    private setPreviousReport(report: IR.StandardReportBase): void {
        if (!this.initialized) {
            return;
        }

        const extDeviceInitialized = (report.connectionInfo & 0x01) === 0x01;
        const extDevicePreviouslyInitialized = (this.previousState?.connectionInfo & 0x01) === 0x01;
        const previousDeviceType = this.previousState?.connectionInfo & 0x6;
        const deviceType = report.connectionInfo & 0x6;
        const noDevice = (report.connectionInfo & 0x6) === 0x6;
        const previouslyNoDevice = (this.previousState?.connectionInfo & 0x6) === 0x6;
        const maybeJoycon = report.connectionInfo & 0x8;
        const firstTime = this.previousState === null;

        const stateChanged = this.previousState && this.previousState.connectionInfo !== report.connectionInfo;

        let detected = false;
        let removed = false;

        if (stateChanged) {
            this.logger.debug(`connectionInfo: ${this.previousState.connectionInfo} -> ${report.connectionInfo}`);
        }

        if (!maybeJoycon) {
            // do nothing
        } else if (firstTime) {
            if (!noDevice) {
                // Already connected
                detected = true;
            }
        } else if (stateChanged) {
            if (maybeJoycon) {
                if (previouslyNoDevice && !noDevice && !extDeviceInitialized) {
                    detected = true;
                } else if (
                    (!extDeviceInitialized && extDevicePreviouslyInitialized && previousDeviceType !== deviceType) ||
                    (!extDeviceInitialized && !extDevicePreviouslyInitialized && noDevice)
                ) {
                    // Ext device newly uninitialized
                    removed = true;
                } else if (!noDevice && !extDeviceInitialized && previousDeviceType !== deviceType) {
                    // Has an ext device and not initialized yet
                    detected = true;
                }
            }
        }

        try {
            if (detected) {
                this.logger.verbose(
                    `Device connection detected: ${this.previousState?.connectionInfo} to ${report.connectionInfo}`
                );
                this.logger.info('External device detected. Initializing...');
                this.findExternalDevice();
            } else if (removed) {
                this.logger.verbose('Device disconnected');
                this.disposeExternalDevice();
                this.emit(EXT_DEVICE_DISCONNECTED);
            }
        } catch (err) {
            this.logger.error('Error processing previous state', err);
        } finally {
            this.previousState = report;
        }
    }

    private processStandardBase(info: IR.StandardReportBase): void {
        this.setPreviousReport(info);
        this.processRumbleQueue();
    }

    private processStandard(info: IR.StandardReport): void {
        this.emit('standard', info);
        this.emit(this.subcommandKey(info.subCommandReply.id), info.subCommandReply);

        this.processStandardBase(info);
    }

    private processMCU(info: IR.MCUReport): void {
        this.emit('mcu', info);
        this.processStandardFull(info);
    }

    private processStandardFull(info: IR.StandardFullReport): void {
        this.emit('standardFull', info);
        this.processStandardBase(info);
    }

    private subcommandKey(id: Byte): string {
        return `subcommand_${convertByteToHexString(id)}`;
    }

    private async disposeExternalDevice(): Promise<void> {
        await this.sendSubcommandAndWaitAsync(new SC.DisableExternalDevicePolling());
        await this.sendSubcommandAndWaitAsync(new SC.EnableIMU6AxisSensorRequest(2));
        await this.sendSubcommandAndWaitAsync(new SC.SetExternalDeviceConfig(Buffer.from([])));
        await this.sendSubcommandAndWaitAsync(new SC.ConfigureMCURequest(0x21, 1, 0));
        await this.sendSubcommandAndWaitAsync(new SC.SetMCUStateRequest(SC.MCUState.SUSPEND));
    }

    onExternalDeviceConnected(callback: (deviceType: ExternalDeviceType) => Promise<void>): void {
        this.on(EXT_DEVICE_CONNECTED, callback);
    }

    onExternalDeviceDisconnected(callback: () => void): void {
        this.on(EXT_DEVICE_DISCONNECTED, callback);
    }

    onDisconnected(callback: () => void): void {
        this.on('disconnected', callback);
    }

    onStandardReport(callback: (data: IR.StandardReport) => void): void {
        this.on('standard', callback);
    }

    onStandardFullReport(callback: (data: IR.StandardFullReport) => void): void {
        this.on('standardFull', callback);
    }

    removeListenerForStandardFullReport(callback: (data: IR.StandardFullReport) => void): void {
        this.removeListener('standardFull', callback);
    }

    onMCUReport(callback: (data: IR.MCUReport) => void): void {
        this.on('mcu', callback);
    }

    listenOnceForSubcommandReply<T extends SC.SubCommandReply>(id: Byte, callback: (data: T) => void): void {
        this.once(this.subcommandKey(id), callback);
    }

    removeListenerForSubcommandReply(id: Byte, callback: (data: SC.SubCommandReply) => void): void {
        this.removeListener(this.subcommandKey(id), callback);
    }

    private async processQueue() {
        if (this.isProcessingQueue || this.commandQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;
        const command = this.commandQueue.shift();
        if (command) {
            await command();
        }
    }

    async sendSubcommandAndWaitAsync<T extends SC.SubCommandReply>(subcommand: SC.RequestBase): Promise<T> {
        this.logger.debug(`Sending subcommand ${subcommand}`);
        const callback = (resolve, reject) => {
            const timer = setTimeout(() => {
                this.removeListenerForSubcommandReply(subcommand.id, subcommandCallback);
                reject(`Timeout: No response to subcommand ${subcommand.id}`);
                this.isProcessingQueue = false;
                this.processQueue();
            }, 5000);

            const subcommandCallback = (data: T) => {
                clearTimeout(timer);
                this.logger.debug(`Received subcommand 0x${data.id.toString(16)} reply: ${data.data.toString('hex')}`);
                resolve(data);
                this.isProcessingQueue = false;
                this.processQueue();
            };

            this.listenOnceForSubcommandReply(subcommand.id, subcommandCallback);
        };

        const promise = new Promise<T>(callback);

        this.commandQueue.push(async () => {
            return this.sendSubcommandAsync(subcommand);
        });

        this.processQueue();
        return promise;
    }

    private generateRumbleData(rumble: Rumble = Rumble.defaultRumble): number[] {
        switch (this._deviceType) {
            case DeviceType.JOYCON_L:
                return [...rumble.data, ...Rumble.nullRumble.data];
            case DeviceType.JOYCON_R:
                return [...Rumble.nullRumble.data, ...rumble.data];
            case DeviceType.PRO_CONTROLLER:
                return [...rumble.data, ...rumble.data];
            default:
                return [...Rumble.nullRumble.data, ...Rumble.nullRumble.data];
        }
    }

    private async sendSubcommandAsync(subcommand: SC.RequestBase): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...this.generateRumbleData(), ...subcommand.getData()]); 
    }

    async sendRumbleSingle(rumble: Rumble): Promise<void> {
        this.rumbleQueue.push(this.generateRumbleData(rumble));
        this.processRumbleQueue();
    }

    async sendRumbleDual(left: Rumble, right: Rumble): Promise<void> {
        this.rumbleQueue.push([...left.data, ...right.data]);
        this.processRumbleQueue();
    }

    async enqueueRumble(rumble: Rumble): Promise<void> {
        this.rumbleQueue.push(this.generateRumbleData(rumble));
        this.processRumbleQueue();
    }

    private async processRumbleQueue() {
        if (this.isSendingRumble || this.rumbleQueue.length === 0) {
            return;
        }

        this.isSendingRumble = true;
        const rumble = this.rumbleQueue.shift();
        if (rumble) {
            const rawData = Buffer.from([0x10, this.getNextPacketNumber(), ...rumble]);
            await this.device!.write(rawData);
        }
        this.isSendingRumble = false;
    }

    async sendRumbleRawAsync(rumble: number[] | Buffer = this.generateRumbleData()): Promise<number> {
        return this.sendOutputReportAsync(0x10, rumble);
    }

    async sendOutputReportAsync(id: number, data: Buffer | number[]): Promise<number> {
        if (this.device === null) {
            return;
        }

        const rawData = Buffer.from([id, this.getNextPacketNumber(), ...data]);
        //this.logger.debug(`Sending output report ${rawData.toString('hex')}`);
        return this.device!.write(rawData);
    }

    private getNextPacketNumber(): number {
        return this.packetNumber++ & 0xf;
    }

    private onError(err: Error): void {
        this.logger.error('Error received from device:', err);
        this.close();
    }
}

export { Joycon, ExternalDevice };
