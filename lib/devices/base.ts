import { Joycon } from '../joycon.js';
import { EventEmitter } from 'events';
import { setTimeout } from 'timers/promises';
import * as winston from 'winston';

export enum ExternalDeviceType {
    RINGCON = 0x20,
    ROULETTE = 0x29
}
export abstract class ExternalDevice extends EventEmitter {
    protected joycon: Joycon;
    protected debugMode = false;

    constructor(joycon: Joycon) {
        super();
        this.joycon = joycon;
    }

    static get deviceId(): ExternalDeviceType {
        return 0 as ExternalDeviceType;
    }

    static get deviceName(): string {
        return 'Not configured';
    }

    async initialize(): Promise<boolean> {
        return true;
    }

    protected get logger(): winston.Logger {
        return this.joycon.logger;
    }

    protected async sendRumbleOnConnected(): Promise<void> {
        // fixed to right joycon
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x80, 0x78, 0x60, 0x80]);
        await setTimeout(25);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x00, 0x01, 0x3f, 0x72]);
        await setTimeout(8);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x00, 0x01, 0x52, 0x72]);
        await setTimeout(35);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x72, 0x98, 0x61, 0xb2]);
        await setTimeout(13);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x92, 0xf8, 0x63, 0xae]);
        await setTimeout(25);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x00, 0x01, 0x49, 0x6a]);
        await setTimeout(23);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x8e, 0xb8, 0x60, 0xab]);
        await setTimeout(15);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x6c, 0x18, 0x62, 0xb2]);
        await setTimeout(26);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x8e, 0xd8, 0xe0, 0x8a]);
        await setTimeout(5);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x90, 0x18, 0x61, 0x91]);
        await setTimeout(11);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x00, 0x01, 0xc4, 0x46]);
        await setTimeout(20);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x90, 0x78, 0x61, 0x87]);
        await setTimeout(2);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0x8c, 0x18, 0x62, 0x81]);
        await setTimeout(10);
        await this.joycon.sendRumbleRawAsync([0, 0, 0, 0, 0, 1, 0x40, 0x40]);
    }

    disconnect() {}

    dispose(): void {
        return;
    }
}
