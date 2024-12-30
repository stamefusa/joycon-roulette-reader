import { Joycon } from '../joycon.js';
import * as SC from '../subcommand.js';
import * as IR from '../reports.js';
import { ExternalDevice, ExternalDeviceType } from './base.js';

export class RouletteDevice extends ExternalDevice {
    private deviceConnected = false;
    private currentNumber = 0;
    private currentCallback: (data: IR.StandardFullReport) => Promise<void> | null = null;
    private previousNumbers: number[] = [];

    static readonly deviceName: string = 'Roulette';

    constructor(joycon: Joycon) {
        super(joycon);
    }

    static override get deviceId(): ExternalDeviceType {
        return ExternalDeviceType.ROULETTE;
    }

    get number(): number {
        return this.currentNumber;
    }

    override async initializeImpl(): Promise<boolean> {
        // enable IMU - move to Joycon class?
        await this.joycon.sendSubcommandAndWaitAsync(new SC.EnableIMU6AxisSensorRequest(3));

        await this.joycon.sendSubcommandAndWaitAsync(
            new SC.SetExternalDeviceConfig(new Uint8Array([0x06, 0x03, 0x25, 0x06]))
        );

        await this.joycon.sendSubcommandAndWaitAsync(
            new SC.EnableExternalDevicePolling(new Uint8Array([0x01, 0x02, 0x03, 0x04]))
        );

        this.currentCallback = this.onStandardFullReport.bind(this);
        this.joycon.onStandardFullReport(this.currentCallback);

        this.deviceConnected = true;
        this.sendRumbleOnConnected();

        return true;
    }

    async onStandardFullReport(data: IR.StandardFullReport): Promise<void> {
        if (this.deviceConnected === false) {
            return;
        }

        const index = data.leftAnalog[1] + (data.leftAnalog[2] << 8);
        const broken = ((data.sixAxisData[2].xAxis >> 8) & 0x01) === 1;
        let number;

        for (let i = 0; i < 10; i++) {
            if (index >> i === 1) {
                number = i + 1;
            }
        }

        if (number === undefined || broken) {
            // no bit set, so no number
            // probably roulette has been disconnected
            return;
        }

        // average of previousNumbers
        const counts = {};
        this.previousNumbers.forEach((n) => {
            counts[n] = counts[n] ? counts[n] + 1 : 1;
        });

        const stableNumber = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];

        this.currentNumber = Number(stableNumber);

        this.emit('rouletteNumber', number, stableNumber);

        this.previousNumbers.push(number);
        if (this.previousNumbers.length > 9) {
            this.previousNumbers.shift();
        }

        return Promise.resolve();
    }

    override dispose(): void {
        this.logger.info('Roulette disconnected');
        this.joycon.removeListenerForStandardFullReport(this.currentCallback);
    }
}
