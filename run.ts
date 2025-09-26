import { Joycon } from './lib/joycon.js';
import { setTimeout } from 'timers/promises';
import { RouletteDevice } from './lib/devices/roulette.js';
import { RingconDevice } from './lib/devices/ringcon.js';
import { ExternalDeviceType } from './lib/devices/base.js';
import * as winston from 'winston';

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

const logger = winston.createLogger({
    level: 'debug', //'debug',
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    transports: [new winston.transports.Console()]
});
const joycon = new Joycon({ logger });

let rouletteDevice: RouletteDevice;
let ringconDevice: RingconDevice;
let rouletteNumber: number;
let lastStableNumber: number;
let stableFrameCount: number = 0;
let rouletteStoppedLogged: boolean = false;
let hasRouletteChanged: boolean = false;
let rouletteStopCount: number = 0;

function onRouletteNumber(rawNumber: number, stableNumber: number) {
    //logger.info(`number: ${rawNumber}`);
    //logger.info(`number: ${stableNumber}`);
    
    // ルーレット停止判定
    if (lastStableNumber === stableNumber) {
        stableFrameCount++;
        // 一度でも変化した後で、20フレーム変化がなければルーレット停止と判定
        if (hasRouletteChanged && stableFrameCount >= 20 && !rouletteStoppedLogged) {
            logger.info(`Roulette stopped at: ${stableNumber}`);
            rouletteStoppedLogged = true;
            rouletteStopCount++;
            
            // APIリクエストを送信
            const apiNumber = stableNumber % 10;
            // 7以上の目を無効化するときは以下のコメントアウトを外す
            // let apiNumber = stableNumber % 10;
            // if (apiNumber >= 7 && apiNumber <= 10) {
            //     apiNumber = Math.floor(Math.random() * 6) + 1;
            // }
            sendApiRequest(apiNumber, (rouletteStopCount - 1)% 5);
        }
    } else {
        stableFrameCount = 0;
        rouletteStoppedLogged = false;
        if (lastStableNumber !== undefined) {
            hasRouletteChanged = true;
        }
        lastStableNumber = stableNumber;
    }
    
    // or read the number from RouletteDevice instance from whereever you want
    // console.log('number:', rouletteDevice.number);
    if (rouletteNumber != stableNumber) {
        io.emit('sensor-update', stableNumber); // クライアントに値を送信
        rouletteNumber = stableNumber;
    }
}

async function sendApiRequest(row: number, column: number) {
    try {
        const url = `http://localhost:8080/mark?row=${row}&column=${column}`;
        const response = await fetch(url);
        const responseText = await response.text();
        logger.info(`API Response: ${responseText}`);
    } catch (error) {
        logger.error(`API Request failed: ${error.message}`);
    }
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
        // ルーレット関連の変数をリセット
        lastStableNumber = undefined;
        stableFrameCount = 0;
        rouletteStoppedLogged = false;
        hasRouletteChanged = false;
        rouletteStopCount = 0;
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

// 静的ファイルを配信
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile('public/index.html');
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});

while (true) {
    logger.info('Finding JoyCon-R');
    const devices = await Joycon.findDevices();
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

process.on('uncaughtException', (err) => {
    logger.error('There was an uncaught exception', err);
    if (joycon !== null) {
        joycon.close();
    }
});

process.on('exit', () => {
    if (joycon !== null) {
        joycon.close();
    }
});
