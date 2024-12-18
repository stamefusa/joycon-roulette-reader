import crc8 from 'crc/crc8';
import { Byte } from './common.js';

namespace SubCommand {
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
    }

    export class DeviceInfoRequest extends RequestBase {
        constructor() {
            super(0x02);
        }
    }

    export enum InputReportMode {
        STANDARD_FULL = 0x30,
        MCU_NFC_IR = 0x31,
        SIMPLE_HID = 0x3F
    };

    export class SetInputReportModeRequest extends RequestBase {

        static readonly STANDARD_FULL = 0x30;
        static readonly MCU_NFC_IR = 0x31;
        static readonly SIMPLE_HID = 0x3F;

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

    export class ConfigureMCURequest extends RequestBase {
        constructor(arg1: Byte, arg2: Byte, arg3: Byte) {
            super(0x21);

            const args = Buffer.alloc(36);
            args[0] = arg2;
            args[1] = arg3;

            this._data = Buffer.concat([new Uint8Array([arg1, ...args, crc8(args)])]);
        }
    }

    export class SetMCUStateRequest extends RequestBase {
        constructor(state: MCUState) {
            super(0x22);
            this._data = Buffer.from([state]);
        }
    }

    export class SetPlayerLightsRequest extends RequestBase {
        constructor(light: LightPosition = LightPosition.OFF, blink: LightPosition = LightPosition.OFF) {
            super(0x30);

            const arg = blink << 4 | light;
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

    export class GetMCUExternalDevice_59 extends RequestBase {
        constructor() {
            super(0x59);
        }
    }

    export class UnknownMCU_5A extends RequestBase {
        constructor(data: Buffer | Uint8Array) {
            super(0x5A);
            this._data = Buffer.from(data);
        }
    }

    export class UnknownMCU_5C extends RequestBase {
        constructor(data: Buffer | Uint8Array) {
            super(0x5C);
            this._data = Buffer.from(data);
        }
    }
}

export default SubCommand;