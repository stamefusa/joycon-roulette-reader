import { HID, devices as findHIDDevices } from 'node-hid';
import { EventEmitter } from 'events';
import { crc8 } from './crc8';
import SubCommand from './subcommand.js';


// JoyCon R
const VENDOR_ID = 1406;
const PRODUCT_ID = 8199;

const defaultRumble = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40];
const nullRumble = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

let tempCounter = 0;

interface DeviceInfo {
    vendorId: number;
    productId: number;
}

interface Report {
    reply: Buffer;
    ack: number;
}

interface SixAxisSensorData {
    xAxis: number;
    yAxis: number;
    zAxis: number;
    gyro1: number;
    gyro2: number;
    gyro3: number;
}

class ButtonInfoLeft {
    private data: number;

    constructor(data: number) {
        this.data = data;
    }

    get down(): boolean {
        return (this.data & 0x01) !== 0;
    }

    get up(): boolean {
        return (this.data & 0x02) !== 0;
    }

    get right(): boolean {
        return (this.data & 0x04) !== 0;
    }

    get left(): boolean {
        return (this.data & 0x08) !== 0;
    }

    get sr(): boolean {
        return (this.data & 0x10) !== 0;
    }

    get sl(): boolean {
        return (this.data & 0x20) !== 0;
    }

    get r(): boolean {
        return (this.data & 0x40) !== 0;
    }

    get zr(): boolean {
        return (this.data & 0x80) !== 0;
    }
}

class ButtonInfoRight {
    private data: number;

    constructor(data: number) {
        this.data = data;
    }

    get y(): boolean {
        return (this.data & 0x01) !== 0;
    }

    get x(): boolean {
        return (this.data & 0x02) !== 0;
    }

    get b(): boolean {
        return (this.data & 0x04) !== 0;
    }

    get a(): boolean {
        return (this.data & 0x08) !== 0;
    }

    get sr(): boolean {
        return (this.data & 0x10) !== 0;
    }

    get sl(): boolean {
        return (this.data & 0x20) !== 0;
    }

    get r(): boolean {
        return (this.data & 0x40) !== 0;
    }

    get zr(): boolean {
        return (this.data & 0x80) !== 0;
    }
}

class ButtonInfoShared {
    private data: number;

    constructor(data: number) {
        this.data = data;
    }

    get minus(): boolean {
        return (this.data & 0x01) !== 0;
    }

    get plus(): boolean {
        return (this.data & 0x02) !== 0;
    }

    get rightStick(): boolean {
        return (this.data & 0x04) !== 0;
    }

    get leftStick(): boolean {
        return (this.data & 0x08) !== 0;
    }

    get home(): boolean {
        return (this.data & 0x10) !== 0;
    }

    get capture(): boolean {
        return (this.data & 0x20) !== 0;
    }
}

class ButtonInfo {
    private leftButtonInfo: ButtonInfoLeft;
    private rightButtonInfo: ButtonInfoRight;
    private sharedButtonInfo: ButtonInfoShared;

    constructor(data: Buffer) {
        this.rightButtonInfo = new ButtonInfoRight(data.readUInt8(0));
        this.sharedButtonInfo = new ButtonInfoShared(data.readUInt8(1));
        this.leftButtonInfo = new ButtonInfoLeft(data.readUInt8(2));
    }

    get left(): ButtonInfoLeft {
        return this.leftButtonInfo;
    }

    get right(): ButtonInfoRight {
        return this.rightButtonInfo;
    }

    get shared(): ButtonInfoShared {
        return this.sharedButtonInfo;
    }
}

class SubCommandReply {
    private _ack: number;
    private _subcmdId: number;
    private _data: Buffer;

    constructor(data: Buffer) {
        this._ack = data.readUInt8(0);
        this._subcmdId = data.readUInt8(1);
        this._data = data.subarray(2);
    }

    get ack(): number {
        return this._ack;
    }

    get id(): number {
        return this._subcmdId;
    }

    get data(): Buffer {
        return this._data;
    }
}

class InputReport {
    private _id: number;
    private _data: Buffer;

    constructor(data: Buffer) {
        this._id = data.readUInt8(0);
        this._data = data;
    }

    get id(): number {
        return this._id;
    }

    get data(): Buffer {
        return this._data;
    }
}

// 0x30
abstract class StandardReportBase extends InputReport {
    private _timer: number;
    private _batteryLevel: number;
    private _connectionInfo: number;
    private _buttonInfo: ButtonInfo;
    private _leftAnalog: Buffer;
    private _rightAnalog: Buffer;
    private _vibrator: number;

    constructor(data: Buffer) {
        super(data);

        this._timer = data.readUInt8(1);
        this._batteryLevel = (data.readUInt8(2) >> 5) & 0x7;
        this._connectionInfo = data.readUInt8(2) & 0x3;
        this._buttonInfo = new ButtonInfo(data.subarray(3, 6));
        this._leftAnalog = data.subarray(6, 9);
        this._rightAnalog = data.subarray(9, 12);
        this._vibrator = data.readUInt8(12);
    }

    get timer(): number {
        return this._timer;
    }

    get batteryLevel(): number {
        return this._batteryLevel;
    }

    get connectionInfo(): number {
        return this._connectionInfo;
    }

    get buttonInfo(): ButtonInfo {
        return this._buttonInfo;
    }

    get leftAnalog(): Buffer {
        return this._leftAnalog;
    }

    get rightAnalog(): Buffer { 
        return this._rightAnalog;
    }

    get vibrator(): number {
        return this._vibrator;
    }
}

class StandardReport extends StandardReportBase {
    private _subCommandReply: SubCommandReply;

    constructor(data: Buffer) {
        super(data);

        this._subCommandReply = new SubCommandReply(data.subarray(13));
    }

    
    get subCommandReply(): SubCommandReply {
        return this._subCommandReply;
    }
}

class StandardFullReport extends StandardReportBase {
    // data at 0ms, +5ms, +10ms for each axis
    private _sixAxisData: SixAxisSensorData[] = [];

    constructor(data: Buffer) {
        super(data);

        for(let i = 0; i < 3; i++) {
            const offset = 13 + (i * 12);
            this._sixAxisData.push({
                xAxis: data.readInt16LE(offset),
                yAxis: data.readInt16LE(offset + 2),
                zAxis: data.readInt16LE(offset + 4),
                gyro1: data.readInt16LE(offset + 6),
                gyro2: data.readInt16LE(offset + 8),
                gyro3: data.readInt16LE(offset + 10)
            });
        }

    }

    
    get sixAxisData(): SixAxisSensorData[] {
        return this._sixAxisData;
    }

}

class MCUReport extends StandardFullReport {
    private _mcuData: Buffer;

    constructor(data: Buffer) {
        super(data);
                
        this._mcuData = data.subarray(49);
    }

    get mcuData(): Buffer {
        return this._mcuData;
    }
}

class Joycon extends EventEmitter {
    private device: HID | null = null;
    private packetNumber: number = 0;
    private latestReports: { [key: number]: Report } = {};

    findDevices(): DeviceInfo[] {
        const devices = findHIDDevices();
        for (const device of devices) {
            if (device.vendorId === VENDOR_ID && device.productId === PRODUCT_ID) {
                // tentatively returns the first device only
                return [device];
            }
        }
        return [];
    }

    openDevice(deviceInfo: DeviceInfo): void {
        this.close();
        this.device = new HID(deviceInfo.vendorId, deviceInfo.productId);
        this.device.on('data', this._dataReceived.bind(this));
        this.device.on('error', this.onError.bind(this));
    }

    close(): void {
        if (this.device !== null) {
            this.device.close();
        }

        this.device = null;
    }

    getLatestReportForId(cmdId: number): Report | undefined {
        return this.latestReports[cmdId];
    }

    private _dataReceived(data: Buffer): void {
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
                this.processStandard(data);
                return;
            case 0x30:
                this.processStandardFull(data);
                return;
            default:
                console.log("Not implemented: ", type);
        }
    }

    private processStandard(data: Buffer): void {
        let offset = 0;

        const info = new StandardReport(data);

        //console.log("Standard Report", info);

        this.latestReports[info.subCommandReply.id] = {
            reply: info.subCommandReply.data,
            ack: info.subCommandReply.ack
        }

    }

    private processStandardFull(data: Buffer): void {
        const info = new StandardFullReport(data);
        this.emit('standardFull', info);
    }

    
    /*
    async sendSubcommandAndWaitAsync(subcommand: SubCommandRequestBase): Promise<number> {
        const sendPromise = this.sendSubcommandAsync(subcommand);
        const 
    }
    */

    async sendSubcommandAsync(subcommand: SubCommand.RequestBase): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...defaultRumble, ...subcommand.getData()]);
    }

    async sendSubcommandRawAsync(subcmd: number, parameters: Buffer | number[] = []): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...defaultRumble, subcmd, ...parameters]);
    }

    async sendRumbleAndSubcmdAsync(rumble: number[] = defaultRumble, subcmd: number, parameters: Buffer | number[] = []): Promise<number> {
        return this.sendOutputReportAsync(0x01, [...rumble, subcmd, ...parameters]);
    }

    async sendOutputReportAsync(id: number, data: Buffer | number[]): Promise<number> {
        this.latestReports = {};
        const rawData = Buffer.from([id, this.getNextPacketNumber(), ...data]);
        console.log(rawData);
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

export { Joycon, StandardReport, StandardFullReport };
