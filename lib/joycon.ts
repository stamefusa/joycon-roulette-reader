import { HID, devices as findHIDDevices } from 'node-hid';
import { EventEmitter } from 'events';
import * as SC from './subcommand.js';
import * as IR from './reports.js';
import { Byte } from './common.js';
import { ExternalDevice } from './devices/base.js';
import { setTimeout as sleep } from 'timers/promises';

// JoyCon R
const VENDOR_ID = 1406;
const PRODUCT_ID = 8199;

const defaultRumble = [0x00, 0x01, 0x40, 0x40];
const nullRumble = [0x00, 0x00, 0x00, 0x00];

const EXT_DEVICE_CONNECTED = 'ext_device_connected';
const EXT_DEVICE_DISCONNECTED = 'ext_device_disconnected';

interface DeviceInfo {
    vendorId: number;
    productId: number;
}

interface Report {
    reply: Buffer;
    ack: number;
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
    private device: HID | null = null;
    private packetNumber: number = 0;
    private latestSubcommandReports: { [key: number]: Report } = {};
    private previousState: IR.StandardReportBase | null = null;
    private initialized: boolean = false;
    private debugMode = false;

    private _serialNumber: string = '';
    private _deviceType: DeviceType | null = null;
    private _firmwareVersion: string = '';

    constructor(debug: boolean = false) {
        super();
        this.debugMode = debug;
    }

    static findDevices(): DeviceInfo[] {
        const devices = findHIDDevices();
        for (const device of devices) {
            //
            if (device.vendorId === VENDOR_ID && device.productId === PRODUCT_ID) {
                // tentatively returns the first device only
                return [device];
            }
        }
        return [];
    }

    async openDevice(deviceInfo: DeviceInfo): Promise<boolean> {
        if (this.device !== null) {
            return false;
        }

        try {
            this.device = new HID(deviceInfo.vendorId, deviceInfo.productId);
            this.device.on('data', this.dataReceived.bind(this));
            this.device.on('error', this.onError.bind(this));

            await this.initializeDevice();
        } catch (err) {
            console.error('Error opening device', err);
            return Promise.resolve(false);
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

        console.log('Serial number:', this._serialNumber);

        const colors = (await this.sendSubcommandAndWaitAsync(new SC.ReadSPI(0x6050, 0x0d))) as SC.ReadSPIResponse;
        this.debugPrint(
            'Body color:',
            colors.SPIData.subarray(0, 3).toString('hex'),
            'Button color:',
            colors.SPIData.subarray(3, 6).toString('hex'),
            'Grip(L)',
            colors.SPIData.subarray(6, 9).toString('hex'),
            'Grip(R)',
            colors.SPIData.subarray(9, 12).toString('hex')
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private debugPrint(...args: any[]): void {
        if (this.debugMode) {
            console.log(...args);
        }
    }

    getLatestSubcommandReportForId(cmdId: number): Report | undefined {
        return this.latestSubcommandReports[cmdId];
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
                this.debugPrint('Maybe reconnect request?', type, data);
                break;
            default:
                this.debugPrint('Not implemented: ', type, data);
        }
    }

    private async findExternalDevice(): Promise<boolean> {
        this.debugPrint('finding external device');

        try {
            let result: SC.SubCommandReply = await this.sendSubcommandAndWaitAsync(
                new SC.SetMCUStateRequest(SC.MCUState.RESUME)
            );
            this.debugPrint('RESULT', result);

            // need sleep?
            await sleep(200);

            // Enable MCU ext device and wait for status
            // send a2 1 8 0 0 0 0 0 0 0 0 21 21 0 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 fa
            // returns
            //  ready: (a0) 21 1 32 0 0 8 0 1b 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 80
            //  not ready: (a0) 21 1 0 0 0 8 0 1b 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 48
            for (let i = 0; i < 100; i++) {
                result = await this.sendSubcommandAndWaitAsync(new SC.ConfigureMCURequest(0x21, 0, 3));
                this.debugPrint('RESULT', result);
                if (result.data[0] == 0xff && result.data[1] == 0xff) {
                    // Probably the device is not connected
                    return false;
                }
                if (result.data[0] == 0x01 && result.data[1] == 0x32) {
                    if (result.data[7] == 0x03) {
                        // Probably the device is ready
                        this.debugPrint('device ready');
                        break;
                    }
                }

                await sleep(300);
            }

            // 21 21 1 1
            // send: 01 0e 00 01 40 40 00 01 40 40 21 21 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 f3
            result = await this.sendSubcommandAndWaitAsync(new SC.ConfigureMCURequest(0x21, 1, 1));
            this.debugPrint('RESULT', result);

            // need sleep?
            await sleep(300);

            // 59 external device info
            result = await this.sendSubcommandAndWaitAsync(new SC.GetExternalDeviceInfo());
            this.debugPrint('RESULT', result);

            // need sleep?
            await sleep(200);

            if (result.data[0] == 0) {
                const deviceType = result.data[1] as ExternalDeviceType;
                this.emit(EXT_DEVICE_CONNECTED, deviceType);
                //return this.initializeExternalDevice(result.data[1] as Byte);
            } else {
                console.error('Failed to initialize external device:', result.data[0]);
                return false;
            }
        } catch (e) {
            console.error('Error initializing external device', e);
            return false;
        }
    }

    private setPreviousReport(report: IR.StandardReportBase): void {
        if (!this.initialized) {
            return;
        }

        const extDeviceInitialized = (report.connectionInfo & 0x01) === 0x01;
        const extDevicePreviouslyInitialized = (this.previousState?.connectionInfo & 0x01) === 0x01;
        const noDevice = (report.connectionInfo & 0x6) === 0x6;
        const maybeJoycon = report.connectionInfo & 0x8;
        const firstTime = this.previousState === null;

        const stateChanged = this.previousState && this.previousState.connectionInfo !== report.connectionInfo;

        let detected = false;
        let removed = false;

        if (!maybeJoycon) {
            // do nothing
        } else if (firstTime) {
            if (!noDevice) {
                detected = true;
            }
        } else if (stateChanged) {
            if (maybeJoycon) {
                if (!noDevice && !extDeviceInitialized) {
                    detected = true;
                } else if (!extDeviceInitialized && extDevicePreviouslyInitialized) {
                    removed = true;
                }
            }
        }

        try {
            if (detected) {
                this.debugPrint(
                    'Device connection detected:',
                    this.previousState?.connectionInfo,
                    'to',
                    report.connectionInfo
                );
                console.log('External device detected. Initializing...');
                this.findExternalDevice();
            } else if (removed) {
                this.debugPrint('Device disconnected');
                this.disposeExternalDevice();
                this.emit(EXT_DEVICE_DISCONNECTED);
            }
        } catch (err) {
            console.error('Error processing previous state', err);
        } finally {
            this.previousState = report;
        }
    }

    private processStandardBase(info: IR.StandardReportBase): void {
        this.setPreviousReport(info);
    }

    private processStandard(info: IR.StandardReport): void {
        this.latestSubcommandReports[info.subCommandReply.id] = {
            reply: info.subCommandReply.data,
            ack: info.subCommandReply.ack
        };

        const hex = convertByteToHexString(info.subCommandReply.id);

        this.emit('standard', info);
        this.emit(`subcommand_${hex}`, info.subCommandReply);

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

    async sendSubcommandAndWaitAsync<T extends SC.SubCommandReply>(subcommand: SC.RequestBase): Promise<T> {
        this.debugPrint(`Sending subcommand ${subcommand}`);
        const callback = (resolve, reject) => {
            const timer = setTimeout(() => {
                this.removeListenerForSubcommandReply(subcommand.id, subcommandCallback);
                reject(`Timeout: No response to subcommand ${subcommand.id}`);
            }, 5000);

            const subcommandCallback = (data: T) => {
                clearTimeout(timer);
                resolve(data);
            };

            this.listenOnceForSubcommandReply(subcommand.id, subcommandCallback);
        };

        const promise = new Promise<T>(callback);

        await this.sendSubcommandAsync(subcommand);
        return promise;
    }

    generateDefaultRumble(): number[] {
        switch (this._deviceType) {
            case DeviceType.JOYCON_L:
                return [...defaultRumble, ...nullRumble];
            case DeviceType.JOYCON_R:
                return [...nullRumble, ...defaultRumble];
            case DeviceType.PRO_CONTROLLER:
                return [...defaultRumble, ...defaultRumble];
            default:
                return [...nullRumble, ...nullRumble];
        }
    }

    async sendSubcommandAsync(subcommand: SC.RequestBase): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...this.generateDefaultRumble(), ...subcommand.getData()]);
    }

    async sendSubcommandRawAsync(subcmd: number, parameters: Buffer | number[] = []): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...this.generateDefaultRumble(), subcmd, ...parameters]);
    }

    async sendRumbleAndSubcmdAsync(
        rumble: number[] = defaultRumble,
        subcmd: number,
        parameters: Buffer | number[] = []
    ): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...rumble, subcmd, ...parameters]);
    }

    async sendRumbleAsync(rumble: number[] | Buffer = this.generateDefaultRumble()): Promise<number> {
        return this.sendOutputReportAsync(0x10, rumble);
    }

    async sendOutputReportAsync(id: number, data: Buffer | number[]): Promise<number> {
        if (this.device === null) {
            return;
        }

        this.latestSubcommandReports = {};
        const rawData = Buffer.from([id, this.getNextPacketNumber(), ...data]);
        return this.device!.write(rawData);
    }

    private getNextPacketNumber(): number {
        return this.packetNumber++ & 0xf;
    }

    private async sendRawAsync(data: Buffer): Promise<number> {
        if (this.device === null) {
            return;
        }

        return this.device!.write(data);
    }

    private onError(err: Error): void {
        console.error('Error received from device', err);
        this.close();
    }
}

export { Joycon, ExternalDevice };
