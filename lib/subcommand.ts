import crc8 from 'crc/crc8';
import { Byte } from './common.js';
import { DeviceType } from './joycon.js';

export class SubCommandReply {
    protected _ack: number;
    protected _subcmdId: Byte;
    protected _data: Buffer;

    protected constructor(data: Buffer) {
        this._ack = data.readUInt8(0);
        this._subcmdId = data.readUInt8(1) as Byte;
        this._data = data.subarray(2);
    }

    get ack(): number {
        return this._ack;
    }

    get id(): Byte {
        return this._subcmdId;
    }

    get data(): Buffer {
        return this._data;
    }

    static fromBuffer(data: Buffer): SubCommandReply {
        switch (data.readUInt8(1)) {
            case 0x02:
                return new DeviceInfoResponse(data);
            case 0x10:
                return new ReadSPIResponse(data);
            default:
                return new SubCommandReply(data);
        }
    }
}

export abstract class RequestBase {
    private _id: Byte;
    protected _data: Buffer;

    constructor(id: Byte) {
        this._id = id;
        this._data = Buffer.alloc(0);
    }

    getData(): Buffer {
        return Buffer.from([this._id, ...this._data]);
    }

    get id(): Byte {
        return this._id;
    }

    toString(): string {
        return `${this.constructor.name}: ${this._data.toString('hex')}`;
    }
}

export enum InputReportMode {
    STANDARD_FULL = 0x30,
    MCU_NFC_IR = 0x31,
    SIMPLE_HID = 0x3f
}

export enum LightPosition {
    OFF = 0x00,
    ONE = 0x01,
    TWO = 0x02,
    THREE = 0x04,
    FOUR = 0x08
}

export enum MCUState {
    SUSPEND = 0x00,
    RESUME = 0x01,
    RESUME_FOR_UPDATE = 0x02
}

// 0x02
export class DeviceInfoRequest extends RequestBase {
    constructor() {
        super(0x02);
    }
}

export class SetInputReportModeRequest extends RequestBase {
    constructor(mode: InputReportMode) {
        super(0x03);
        this._data = Buffer.from([mode]);
    }
}

export class TriggerButtonElapsedTimeRequest extends RequestBase {
    constructor(time: Byte) {
        super(0x04);
        this._data = Buffer.from([time]);
    }
}
export class DeviceInfoResponse extends SubCommandReply {
    constructor(data: Buffer) {
        super(data);
    }

    get firmwareVersion(): string {
        return `${this._data.readUInt8(0)}.${this._data.readUInt8(1)}`;
    }

    get type(): DeviceType {
        return this._data.readUInt8(2) as DeviceType;
    }

    get macAddress(): string {
        return this._data
            .subarray(4, 10)
            .toString('hex')
            .split(/(.{2})/)
            .filter(Boolean)
            .join(':');
    }

    get customColor(): boolean {
        return this._data.readUInt8(11) === 0x01;
    }
}

// 0x08
export class Shipment extends RequestBase {
    constructor(status: Byte) {
        super(0x08);
        this._data = Buffer.from([status]);
    }
}

export class ReadSPI extends RequestBase {
    constructor(address: number, length: Byte) {
        super(0x10);
        this._data = Buffer.alloc(5);
        this._data.writeUint32LE(address);
        this._data.writeUint8(length, 4);
    }
}

export class ReadSPIResponse extends SubCommandReply {
    constructor(data: Buffer) {
        super(data);
    }

    get address(): number {
        return this._data.readUInt32LE(0);
    }

    get length(): Byte {
        return this._data.readUInt8(4) as Byte;
    }

    get SPIData(): Buffer {
        return this._data.subarray(5, 5 + this.length);
    }
}

// 0x21
export class ConfigureMCURequest extends RequestBase {
    constructor(arg1: Byte, arg2: Byte, arg3: Byte) {
        super(0x21);

        const args = Buffer.alloc(36);
        args[0] = arg2;
        args[1] = arg3;

        this._data = Buffer.concat([new Uint8Array([arg1, ...args, crc8(args)])]);
    }
}

// 0x22
export class SetMCUStateRequest extends RequestBase {
    constructor(state: MCUState) {
        super(0x22);
        this._data = Buffer.from([state]);
    }
}

// 0x30
export class SetPlayerLightsRequest extends RequestBase {
    constructor(light: LightPosition = LightPosition.OFF, blink: LightPosition = LightPosition.OFF) {
        super(0x30);

        const arg = (blink << 4) | light;
        this._data = Buffer.from([arg]);
    }
}

export class EnableIMU6AxisSensorRequest extends RequestBase {
    constructor(status: Byte) {
        super(0x40);
        this._data = Buffer.from([status]);
    }
}

export class EnableVibrationRequest extends RequestBase {
    constructor(enabled: boolean) {
        super(0x48);
        this._data = Buffer.from([enabled ? 0x01 : 0x00]);
    }
}

export class UnknownMCUExternalDevice_58 extends RequestBase {
    constructor(arg1: Byte, arg2: Byte, arg3: Byte, arg4: Byte) {
        super(0x58);
        this._data = Buffer.from([arg1, arg2, arg3, arg4]);
    }
}

export class GetExternalDeviceInfo extends RequestBase {
    constructor() {
        super(0x59);
    }
}

export class EnableExternalDevicePolling extends RequestBase {
    constructor(data: Buffer | Uint8Array) {
        super(0x5a);
        this._data = Buffer.from(data);
    }
}

export class DisableExternalDevicePolling extends RequestBase {
    constructor() {
        super(0x5b);
    }
}

export class SetExternalDeviceConfig extends RequestBase {
    constructor(data: Buffer | Uint8Array) {
        super(0x5c);
        this._data = Buffer.from(data);
    }
}
