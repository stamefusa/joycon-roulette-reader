import { Joycon } from "../joycon.js";
import SC from "../subcommand.js";
import IR from "../reports.js";
import { ExternalDevice } from "./base.js";

interface RouletteState {
    number: number;
    broken: boolean;
}

export class RouletteDevice extends ExternalDevice {
    private deviceConnected = false;

    constructor(joycon: Joycon) {
        super(0x29, joycon);
    }

    override async initializeDevice(): Promise<boolean> {
        let result: SC.SubCommandReply;
        console.log("========== Initializing Roulette ==========");
        // enable IMU - move to Joycon class?
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.EnableIMU6AxisSensorRequest(3));
        console.log("RESULT", result);
        
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.SetExternalDeviceConfig(new Uint8Array([0x06, 0x03, 0x25, 0x06])));
        console.log("RESULT", result);
        
        // step8: Start external polling 5A
        result = await this.joycon.sendSubcommandAndWaitAsync(new SC.EnableExternalDevicePolling(new Uint8Array([0x01, 0x02, 0x03, 0x04])));
        console.log("RESULT", result);

        return true;
    }

    async onStandardFullReport(data: IR.StandardFullReport): Promise<void>{
        const index = data.leftAnalog[1] + (data.leftAnalog[2] << 8);
        const broken = ((data.sixAxisData[2].xAxis >> 8) & 0x01) === 1;
        let number;
    
        for (let i = 0; i < 10; i++) {
            if ((index >> i) === 1) {
                number = i + 1;
            }
        }

        if (number === undefined) {
            // no bit set, so no number
            // probably roulette has been disconnected
            return;
        }

        const state: RouletteState = {number, broken};
    
        console.log(state);
        this.joycon.emit("rouletteState", state);
        return Promise.resolve();
    }

    override dispose(): void {
        console.log("Roulette disconnected");
    }
}