import { Byte } from "../common.js";
import { Joycon } from "../joycon.js";
import IR from "../reports.js";

export abstract class ExternalDevice {
    protected joycon: Joycon;
    private deviceId: Byte;

    constructor(deviceId: Byte, joycon: Joycon) {
        this.joycon = joycon;
        this.deviceId = deviceId;
    }

    getDeviceId(): Byte {
        return this.deviceId;
    }

    // eslint-disable @typescript-eslint/no-unused-vars
    async onStandardFullReport(_: IR.StandardFullReport): Promise<void>{
        return Promise.resolve();
    }

    // eslint-disable @typescript-eslint/no-unused-vars
    async onStandardReport(_: IR.StandardReport): Promise<void>{
        return Promise.resolve();
    }

    async initializeDevice(): Promise<boolean> {
        return true;
    }

    dispose(): void {
        return;
    }
}