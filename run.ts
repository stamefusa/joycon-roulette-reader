import { Joycon } from './lib/joycon.js';
import { setTimeout } from 'timers/promises';
import { RouletteDevice } from './lib/devices/roulette.js';
import { RingconDevice } from './lib/devices/ringcon.js';
import { ExternalDeviceType } from './lib/devices/base.js';

const joycon = new Joycon();
let rouletteDevice: RouletteDevice;
let ringconDevice: RingconDevice;

function onRouletteNumber(rawNumber: number, stableNumber: number) {
    console.log('number:', stableNumber);
    // or read the number from RouletteDevice instance from whereever you want
    // console.log('number:', rouletteDevice.number);
}

function onRingconPower(power: number) {
    console.log('power:', power);
}

joycon.onExternalDeviceConnected(async (device: ExternalDeviceType) => {
    console.log('External device connected:', device);
    switch (device) {
        case RingconDevice.deviceId:
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
            console.log('Unsupported device connected');
            break;
    }
});

joycon.onExternalDeviceDisconnected(() => {
    console.log('External device disconnected');
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
    console.log('JoyCon disconnected');
    rouletteDevice = ringconDevice = null;
});

while (true) {
    console.log('Finding JoyCon-R');
    const devices = Joycon.findDevices();
    console.log(devices);

    if (devices.length === 0) {
        await setTimeout(1000);
        continue;
    }
    const deviceOpened = await joycon.openDevice(devices[0]);
    if (!deviceOpened) {
        console.log("Couldn't open device");
        joycon.close();
        continue;
    }

    break;
}
