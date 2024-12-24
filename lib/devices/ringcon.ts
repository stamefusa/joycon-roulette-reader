import {ExternalDevice} from './base.js';
import {Joycon} from '../joycon.js';
import SC from '../subcommand.js';
import IR from '../reports.js';
import { setTimeout } from 'timers/promises';

export class RingconDevice extends ExternalDevice {
    constructor(joycon: Joycon) {
        super(0x20, joycon);
    }

    override async initializeDevice(): Promise<boolean> {
        let result: SC.SubCommandReply;
        console.log("========== Initializing Ringcon ==========");
        // enable IMU
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.EnableIMU6AxisSensorRequest(3));
        console.log("RESULT", result);

        // Set input report mode to standard full if not already set
        //result = await this.joycon.sendSubcommandAndWaitAsync(new SC.SetInputReportModeRequest(SC.InputReportMode.STANDARD_FULL));

        // 5C
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.SetExternalDeviceConfig(Buffer.from([0x06, 0x03, 0x25, 0x06])));
        console.log("RESULT", result);

        // 5A
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.EnableExternalDevicePolling(new Uint8Array([0x04, 0x01, 0x01, 0x02])));
        console.log("RESULT", result);

        // 58
        /*
        58 4 5 1 2
        d8 58 0 8 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 0 0 2
        d8 58 0 8 0 0 0 0 0 2c 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 4 5 2
        d8 58 0 8 0 0 0 0 c8 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 0 0 2
        d8 58 0 8 0 0 0 0 0 2c 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 4 a 2
        d8 58 0 14 0 0 0 0 43 1d 0 0 49 a 0 0 18 10 0 0 50 11 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 4 32 2
        d8 58 0 8 0 0 0 0 3 0 0 81 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 0 1 2
        d8 58 0 10 0 0 0 0 6 0 46 0 16 57 41 50 33 36 36 20 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 0 0 2
        d8 58 0 8 0 0 0 0 0 2c 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 4 a 2
        d8 58 0 14 0 0 0 0 43 1d 0 0 49 a 0 0 18 10 0 0 50 11 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 0 0 2
        d8 58 0 8 0 0 0 0 0 2c 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0

        58 4 4 1a 2
        d8 58 0 14 0 0 0 0 fe ca 86 0 fe ca 86 0 31 10 f5 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
        */

        // 0x04 0x00 0x00 0x02 -> 0x00 0x08 0x00 0x00 0x00 0x00 0x00 0x2c
        // 0x04 0x00 0x01 0x02 -> 0x00 0x10 0x00 0x00 0x00 0x00 0x06 0x00 0x46 0x00 0x16 0x57 0x41 0x50 0x33 0x36 0x36 0x20
        // 0x04 0x04 0x05 0x02 -> 0x00 0x08 0x00 0x00 0x00 0x00 0xc8 0x00
        // 0x04 0x04 0x0a 0x02 -> 0x00 0x14 0x00 0x00 0x00 0x00 0x43 0x1d 0x00 0x00 0x49 0x0a 0x00 0x00 0x18 0x10 0x00 0x00 0x50 0x11
        // 0x04 0x04 0x1a 0x02 -> 0x00 0x14 0x00 0x00 0x00 0x00 0xfe 0xca 0x86 0x00 0xfe 0xca 0x86 0x00 0x31 0x10 0xf5 0x00
        // 0x04 0x04 0x32 0x02 -> 0x00 0x08 0x00 0x00 0x00 0x00 0x03 0x00 0x00 0x81
        // 0x04 0x05 0x01 0x02 -> 0x00 0x08 0x00 0x00 0x00 0x00 0x01 0x00
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 5, 1, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 0, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 5, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 0, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 0xa, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 0x32, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 1, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 0, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 0xa, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 0, 2));
        console.log("RESULT", result);
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 0x1a, 2));
        console.log("RESULT", result);

        await this.sendRumbleOnConnected();

        return true;
    }

    private async sendRumbleOnConnected(): Promise<void> {

        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0xe8, 0x60, 0x4e, 0x69]);
        await setTimeout(70);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x92, 0xe7, 0x57, 0xa6]);
        await setTimeout(70);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x7e, 0xee, 0xa2, 0xaa]);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0xe8, 0x00, 0x47, 0x45]);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x85, 0xaf, 0xa9, 0x80]);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x74, 0x86, 0x00, 0x87]);
        await setTimeout(40);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x0c, 0x1b, 0xba, 0x57]);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x7f, 0xc0, 0x9d, 0x84]);
        await setTimeout(40);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x75, 0xe0, 0x18, 0x85]);
        await setTimeout(30);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0xec, 0x00, 0x4a, 0x44]);
        await setTimeout(30);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0xe8, 0x00, 0xc2, 0x42]);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x9c, 0x18, 0x00, 0x80]);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x00, 0x01, 0x40, 0x40]);
    }


    override async onStandardFullReport(data: IR.StandardFullReport): Promise<void>{
        const pressure = data.data.readUint16LE(39);
        console.log(pressure);
    }

    override dispose(): void {
        console.log("Ringcon disconnected");
    }
}
