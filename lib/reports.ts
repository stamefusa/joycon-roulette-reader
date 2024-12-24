import SC from './subcommand.js';

namespace InputReport {
    export class SixAxisSensorData {
        xAxis: number;
        yAxis: number;
        zAxis: number;
        gyro1: number;
        gyro2: number;
        gyro3: number;
    }
    
    export class ButtonInfoLeft {
        private data: number;

        readonly down: boolean;
        readonly up: boolean;
        readonly right: boolean;
        readonly left: boolean;
        readonly sr: boolean;
        readonly sl: boolean;
        readonly l: boolean;
        readonly zl: boolean;
    
        constructor(data: number) {
            this.data = data;

            this.down = (this.data & 0x01) !== 0;
            this.up = (this.data & 0x02) !== 0;
            this.right = (this.data & 0x04) !== 0;
            this.left = (this.data & 0x08) !== 0;
            this.sr = (this.data & 0x10) !== 0;
            this.sl = (this.data & 0x20) !== 0;
            this.l = (this.data & 0x40) !== 0;
            this.zl = (this.data & 0x80) !== 0;
        }
    }
    
    export  class ButtonInfoRight {
        private data: number;

        readonly y: boolean;
        readonly x: boolean;
        readonly b: boolean;
        readonly a: boolean;
        readonly sr: boolean;
        readonly sl: boolean;
        readonly r: boolean;
        readonly zr: boolean;
    
        constructor(data: number) {
            this.data = data;

            this.y = (this.data & 0x01) !== 0;
            this.x = (this.data & 0x02) !== 0;
            this.b = (this.data & 0x04) !== 0;
            this.a = (this.data & 0x08) !== 0;
            this.sr = (this.data & 0x10) !== 0;
            this.sl = (this.data & 0x20) !== 0;
            this.r = (this.data & 0x40) !== 0;
            this.zr = (this.data & 0x80) !== 0;
        }
    }
    
    export class ButtonInfoShared {
        private data: number;

        readonly minus: boolean;
        readonly plus: boolean;
        readonly rightStick: boolean;
        readonly leftStick: boolean;
        readonly home: boolean;
        readonly capture: boolean;

    
        constructor(data: number) {
            this.data = data;
            this.minus = (this.data & 0x01) !== 0;
            this.plus = (this.data & 0x02) !== 0;
            this.rightStick = (this.data & 0x04) !== 0;
            this.leftStick = (this.data & 0x08) !== 0;
            this.home = (this.data & 0x10) !== 0;
            this.capture = (this.data & 0x20) !== 0;
        }
    }
    
    export class ButtonInfo {
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
    
    
    export abstract class InputReportBase {
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
    export abstract class StandardReportBase extends InputReportBase {
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
            this._batteryLevel = (data.readUInt8(2) >> 4) & 0xF;
            this._connectionInfo = data.readUInt8(2) & 0xF;
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

    // 0x21
    export class StandardReport extends StandardReportBase {
        private _subCommandReply: SC.SubCommandReply;
    
        constructor(data: Buffer) {
            super(data);
    
            this._subCommandReply = new SC.SubCommandReply(data.subarray(13, 50));
        }
    
        
        get subCommandReply(): SC.SubCommandReply {
            return this._subCommandReply;
        }
    }
    
    export class StandardFullReport extends StandardReportBase {
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
    
    export class MCUReport extends StandardFullReport {
        private _mcuData: Buffer;
    
        constructor(data: Buffer) {
            super(data);
                    
            this._mcuData = data.subarray(49);
        }
    
        get mcuData(): Buffer {
            return this._mcuData;
        }
    }
}

export default InputReport;