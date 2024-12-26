import { Joycon } from '../joycon.js';
import { EventEmitter } from 'events';
import { setTimeout } from 'timers/promises';

export enum ExternalDeviceType {
    RINGCON = 0x20,
    ROULETTE = 0x29
}
export abstract class ExternalDevice extends EventEmitter {
    protected joycon: Joycon;

    constructor(joycon: Joycon) {
        super();
        this.joycon = joycon;
    }

    static get deviceId(): ExternalDeviceType {
        return 0 as ExternalDeviceType;
    }

    async initialize(): Promise<boolean> {
        return true;
    }

    protected async sendRumbleOnConnected(): Promise<void> {
        // fixed to right joycon
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0xe8, 0x60, 0x4e, 0x69]);
        await setTimeout(70);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x92, 0xe7, 0x57, 0xa6]);
        await setTimeout(70);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x7e, 0xee, 0xa2, 0xaa]);
        await setTimeout(3);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0xe8, 0x00, 0x47, 0x45]);
        await setTimeout(13);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x85, 0xaf, 0xa9, 0x80]);
        await setTimeout(7);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x74, 0x86, 0x00, 0x87]);
        await setTimeout(37);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x0c, 0x1b, 0xba, 0x57]);
        await setTimeout(8);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x7f, 0xc0, 0x9d, 0x84]);
        await setTimeout(33);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x75, 0xe0, 0x18, 0x85]);
        await setTimeout(28);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0xec, 0x00, 0x4a, 0x44]);
        await setTimeout(29);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0xe8, 0x00, 0xc2, 0x42]);
        await setTimeout(15);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x9c, 0x18, 0x00, 0x80]);
        await setTimeout(7);
        await this.joycon.sendRumbleAsync([0, 0, 0, 0, 0, 0x00, 0x01, 0x40, 0x40]);
    }

    disconnect() {}

    dispose(): void {
        return;
    }
}
