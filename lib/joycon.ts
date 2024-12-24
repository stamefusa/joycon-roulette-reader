import { HID, devices as findHIDDevices } from 'node-hid';
import { EventEmitter } from 'events';
import SC from './subcommand.js';
import IR from './reports.js';
import {Byte} from './common.js';
import { RouletteDevice } from './devices/roulette.js';
import { RingconDevice } from './devices/ringcon.js';
import { ExternalDevice } from './devices/base.js';
import { setTimeout as sleep } from "timers/promises";

// JoyCon R
const VENDOR_ID = 1406;
const PRODUCT_ID = 8199;

const defaultRumble = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40];
const nullRumble = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

interface DeviceInfo {
    vendorId: number;
    productId: number;
}

interface Report {
    reply: Buffer;
    ack: number;
}



function convertByteToHexString(id: Byte): string {
    return ( '00' + id ).slice( -2 );
}

class Joycon extends EventEmitter {
    private device: HID | null = null;
    private packetNumber: number = 0;
    private latestSubcommandReports: { [key: number]: Report } = {};
    private previousState: IR.StandardReportBase | null = null;
    private currentExternalDevice: ExternalDevice | null = null;
    private externalDevices: { [key: number]: ExternalDevice } = {};
    private initialized: boolean = false;

    constructor() {
        super();
        this.registerExternalDevice(new RouletteDevice(this));
        this.registerExternalDevice(new RingconDevice(this));
    }

    
    get externalDevice(): ExternalDevice | null {
        return this.currentExternalDevice;
    }

    findDevices(): DeviceInfo[] {
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
        try {
            this.close();
            this.device = new HID(deviceInfo.vendorId, deviceInfo.productId);
            this.device.on('data', this.dataReceived.bind(this));
            this.device.on('error', this.onError.bind(this));

            await this.initializeDevice();
        } catch(err) {
            console.error("Error opening device", err);
            return Promise.resolve(false);
        }

        return Promise.resolve(true);
    }

    private async initializeDevice() {
        // Set shipment state
        // TODO create a request class for this
        await this.sendSubcommandRawAsync(0x08, [0x00]);
        await sleep(150);
        console.log(this.getLatestSubcommandReportForId(0x08));

        await this.sendSubcommandRawAsync(0x02);
        await sleep(150);
        console.log(this.getLatestSubcommandReportForId(0x00));
    
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

    close(): void {
        if (this.device !== null) {
            this.device.close();
        }

        this.device = null;
    }

    getLatestSubcommandReportForId(cmdId: number): Report | undefined {
        return this.latestSubcommandReports[cmdId];
    }

    private dataReceived(data: Buffer): void {
        // Move this to each report class
        const typeNames: { [key: number]: string } = {
            0x21: "Standard",
            0x23: "NFC/IR",
            0x30: "Standard Full",
            0x31: "NFC/IR MCU",
            0x32: "Unknown 0x32",
            0x33: "Unknown 0x33",
            0x3F: "Input",
        }

        const type = data.readUInt8(0);
        //console.log(typeNames[type], data);

        switch(type) {
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
                console.log("Maybe reconnect request?", type, data);
                break;
            default:
                console.log("Not implemented: ", type, data);
        }
    }

    private registerExternalDevice(device: ExternalDevice): void {
        this.externalDevices[device.getDeviceId()] = device;
    }

    private async initializeExternalDevice(deviceId: Byte): Promise<boolean> {
        const device = this.externalDevices[deviceId];
        if (device == null) {
            console.error(`Device ${deviceId} not found`);
            return false;
        }

        this.currentExternalDevice = device;
        const result = await device.initializeDevice();

        if(!result) {
            console.log("Failed to external initialize device:", deviceId);
            this.currentExternalDevice = null;
            return false;
        }

        return true;
    }

    private async findExternalDevice(): Promise<boolean> {
        console.log("finding external device");

        try {
            let result: SC.SubCommandReply = await this.sendSubcommandAndWaitAsync(new SC.SetMCUStateRequest(SC.MCUState.RESUME));
            console.log("RESULT", result);

            // need sleep?
            await sleep(200);
            
            // Enable MCU ext device and wait for status
            // send a2 1 8 0 0 0 0 0 0 0 0 21 21 0 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 fa
            // returns  
            //  ready: (a0) 21 1 32 0 0 8 0 1b 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 80
            //  not ready: (a0) 21 1 0 0 0 8 0 1b 3 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 48
            for (let i = 0; i < 100; i++) {
                result = await this.sendSubcommandAndWaitAsync(new SC.ConfigureMCURequest(0x21, 0, 3));
                console.log("RESULT", result);
                if(result.data[0] == 0x01 && result.data[1] == 0x32) {
                    if (result.data[7] == 0x03) { // Probably the device is ready
                        console.log("device ready");
                        break;
                    }
                }

                await sleep(300);
            }
            
            // 21 21 1 1
            // send: 01 0e 00 01 40 40 00 01 40 40 21 21 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 f3
            result = await this.sendSubcommandAndWaitAsync(new SC.ConfigureMCURequest(0x21, 1, 1));
            console.log("RESULT", result);

            // need sleep?
            await sleep(300);
            
            // 59 external device info
            result = await this.sendSubcommandAndWaitAsync(new SC.GetExternalDeviceInfo());
            console.log("RESULT", result);
            
            // need sleep?
            await sleep(200);

            if(result.data[0] == 0) {
                return this.initializeExternalDevice(result.data[1] as Byte);
            } else {
                console.log("Failed to initialize Roulette");
                return false;
            }

        } catch (e) {
            console.error("Error initializing external device", e);
            return false;
        }
    }

    private setPreviousReport(report: IR.StandardReportBase): void {
        if(!this.initialized) {
            return;
        }

        try {
            // need to modify these values to support other devices
            if (this.previousState?.connectionInfo !== report.connectionInfo) {
                // 0x8: perhaps joycon
                // 0x4, 0x2: ext device type?
                // 0x1: connected?
                if ((report.connectionInfo & 0x8) == 0x8) {
                    if ((report.connectionInfo & 0x6) === 0x6) {
                        // Device disconnected?
                        console.log("Device disconnected");
                        this.currentExternalDevice?.dispose();
                        this.currentExternalDevice = null;
                    } else if ((report.connectionInfo & 0x1) === 0x0 && this.currentExternalDevice == null) {
                        // Uninitialized device connected?
                        console.log("Device connection detected:", report.connectionInfo);
                        this.findExternalDevice();
                    }
                }

            }
        } catch(err) {
            console.error("Error processing previous state", err);
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
        }

        const hex = convertByteToHexString(info.subCommandReply.id);

        this.emit('standard', info);
        this.emit(`subcommand_${hex}`, info.subCommandReply);

        this.currentExternalDevice?.onStandardReport(info);
        this.processStandardBase(info);
    }

    private processMCU(info: IR.MCUReport): void {
        this.processStandardFull(info);
    }

    private processStandardFull(info: IR.StandardFullReport): void {
        this.emit('standardFull', info);
        this.currentExternalDevice?.onStandardFullReport(info);
        this.processStandardBase(info);
    }

    private subcommandKey(id: Byte): string {
        return `subcommand_${convertByteToHexString(id)}`;
    }

    emitExternalDeviceEvent(event: string, data): void {
        this.emit(`ext:${event}`, data);
    }

    listenOnceForSubcommandReply(id: Byte, callback: (data: SC.SubCommandReply) => void): void {
        this.once(this.subcommandKey(id), callback);
    }

    removeListenerForSubcommandReply(id: Byte, callback: (data: SC.SubCommandReply) => void): void {
        this.removeListener(this.subcommandKey(id), callback);
    }

    async sendSubcommandAndWaitAsync(subcommand: SC.RequestBase): Promise<SC.SubCommandReply> {
        console.log(`Sending subcommand ${subcommand}`);
        const callback = (resolve, reject) => {
                        
            const timer = setTimeout(() => {
                this.removeListenerForSubcommandReply(subcommand.id, subcommandCallback);
                reject(`Timeout: No response to subcommand ${subcommand.id}`);
            }, 5000);

            const subcommandCallback = (data: SC.SubCommandReply) => {
                clearTimeout(timer);
                resolve(data);
            };

            this.listenOnceForSubcommandReply(subcommand.id, subcommandCallback);
        };

        const promise = new Promise<SC.SubCommandReply>(callback);

        await this.sendSubcommandAsync(subcommand);
        return promise;
    }

    async sendSubcommandAsync(subcommand: SC.RequestBase): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...defaultRumble, ...subcommand.getData()]);
    }

    async sendSubcommandRawAsync(subcmd: number, parameters: Buffer | number[] = []): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...defaultRumble, subcmd, ...parameters]);
    }

    async sendRumbleAndSubcmdAsync(rumble: number[] = defaultRumble, subcmd: number, parameters: Buffer | number[] = []): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...rumble, subcmd, ...parameters]);
    }

    async sendRumbleAsync(rumble: number[] | Buffer = defaultRumble): Promise<number> {
        return this.sendOutputReportAsync(0x10, rumble);
    }

    async sendOutputReportAsync(id: number, data: Buffer | number[]): Promise<number> {
        this.latestSubcommandReports = {};
        const rawData = Buffer.from([id, this.getNextPacketNumber(), ...data]);
        return this.device!.write(rawData);
    }

    private getNextPacketNumber(): number {
        return this.packetNumber++ & 0xF;
    }

    private async sendRawAsync(data: Buffer): Promise<number> {
        return this.device!.write(data);
    }

    private onError(err: Error): void {
        console.error("Error received from device", err);
    }
}

export { Joycon, ExternalDevice };
