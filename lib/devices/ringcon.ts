import { ExternalDevice, ExternalDeviceType } from './base.js';
import { Joycon } from '../joycon.js';
import * as SC from '../subcommand.js';
import * as IR from '../reports.js';
export class RingconDevice extends ExternalDevice {
    private currentCallback: (data: IR.StandardFullReport) => Promise<void> | null = null;

    static readonly deviceName: string = 'Ringcon';

    constructor(joycon: Joycon) {
        super(joycon);
    }

    static override get deviceId(): ExternalDeviceType {
        return 0x20;
    }

    override async initializeImpl(): Promise<boolean> {
        // enable IMU
        await this.joycon.sendSubcommandAndWaitAsync(new SC.EnableIMU6AxisSensorRequest(3));

        // Set input report mode to standard full if not already set
        //result = await this.joycon.sendSubcommandAndWaitAsync(new SC.SetInputReportModeRequest(SC.InputReportMode.STANDARD_FULL));

        // 5C
        await this.joycon.sendSubcommandAndWaitAsync(
            new SC.SetExternalDeviceConfig(
                new Uint8Array([
                    0x06, 0x03, 0x25, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00
                ])
            )
        );

        // 5A
        await this.joycon.sendSubcommandAndWaitAsync(
            new SC.EnableExternalDevicePolling(new Uint8Array([0x04, 0x01, 0x01, 0x02]))
        );

        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 5, 1, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 0, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 5, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 0, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 0xa, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 0x32, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 1, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 0, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 0xa, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 0, 0, 2));
        await this.joycon.sendSubcommandAndWaitAsync(new SC.UnknownMCUExternalDevice_58(4, 4, 0x1a, 2));

        // no need to wait
        this.sendRumbleOnConnected();

        this.currentCallback = this.onStandardFullReport.bind(this);
        this.joycon.onStandardFullReport(this.currentCallback);

        return true;
    }

    private async onStandardFullReport(data: IR.StandardFullReport): Promise<void> {
        const pressure = data.data.readUint16LE(39);
        this.emit('power', pressure);
    }

    override dispose(): void {
        this.logger.info('Ringcon disconnected');
        this.joycon.removeListenerForStandardFullReport(this.currentCallback);
    }
}
