import { Joycon } from './lib/joycon.js';
import { setTimeout } from 'timers/promises';
import { RouletteDevice } from './lib/devices/roulette.js';
import { RingconDevice } from './lib/devices/ringcon.js';
import { ExternalDeviceType } from './lib/devices/base.js';
import * as winston from 'winston';

const logger = winston.createLogger({
    level: 'debug', //'debug',
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    transports: [new winston.transports.Console()]
});
const joycon = new Joycon({ logger });

let rouletteDevice: RouletteDevice;
let ringconDevice: RingconDevice;

function onRouletteNumber(rawNumber: number, stableNumber: number) {
    logger.info(`number: ${stableNumber}`);
    // or read the number from RouletteDevice instance from whereever you want
    // console.log('number:', rouletteDevice.number);
}

function onRingconPower(power: number) {
    logger.info(`power: ${power}`);
}

joycon.onExternalDeviceConnected(async (device: ExternalDeviceType) => {
    logger.info(`External device connected: ${device}`);
    switch (device) {
        case ExternalDeviceType.RINGCON:
            ringconDevice = new RingconDevice(joycon);
            await ringconDevice.initialize();
            ringconDevice.on('power', onRingconPower);
            break;
        case ExternalDeviceType.ROULETTE:
            rouletteDevice = new RouletteDevice(joycon);
            await rouletteDevice.initialize();
            rouletteDevice.on('rouletteNumber', onRouletteNumber);
            break;
        default:
            logger.error('Unsupported device connected');
            break;
    }
});

joycon.onExternalDeviceDisconnected(() => {
    logger.info('External device disconnected');
    if (rouletteDevice) {
        rouletteDevice.dispose();
        rouletteDevice = null;
    }

    if (ringconDevice) {
        ringconDevice.dispose();
        ringconDevice = null;
    }
});

joycon.onDisconnected(() => {
    logger.info('JoyCon disconnected');
    rouletteDevice = ringconDevice = null;
});

while (true) {
    logger.info('Finding JoyCon-R');
    const devices = Joycon.findDevices();
    logger.verbose(JSON.stringify(devices));

    if (devices.length === 0) {
        await setTimeout(1000);
        continue;
    }
    const deviceOpened = await joycon.openDevice(devices[0]);
    if (!deviceOpened) {
        logger.error("Couldn't open device");
        joycon.close();
        continue;
    }

    break;
}
