import { BehaviorSubject, fromEvent, merge, Observable, Subject } from 'rxjs';
import { concatMap, filter, first, map, share, take } from 'rxjs/operators';

import {
    AccelerometerData,
    EEGReading,
    EventMarker,
    GyroscopeData,
    MuseControlResponse,
    MuseDeviceInfo,
    PPGReading,
    TelemetryData,
    XYZ,
} from './lib/muse-interfaces';
import {
    decodeEEGSamples,
    decodePPGSamples,
    parseAccelerometer,
    parseControl,
    parseGyroscope,
    parseTelemetry,
} from './lib/muse-parse';
import { parseMuse3Packet } from './lib/muse3-parse';
import { decodeResponse, encodeCommand, observableCharacteristic } from './lib/muse-utils';

export { zipSamples, EEGSample } from './lib/zip-samples';
export { zipSamplesPpg, PPGSample } from './lib/zip-samplesPpg';
export { setMuse3DebugMode } from './lib/muse3-parse';
export {
    EEGReading,
    PPGReading,
    TelemetryData,
    AccelerometerData,
    GyroscopeData,
    XYZ,
    MuseControlResponse,
    MuseDeviceInfo,
};

export const MUSE_SERVICE = 0xfe8d;

// Muse 1/2/S (Classic) Characteristics
const CONTROL_CHARACTERISTIC = '273e0001-4c4d-454d-96be-f03bac821358';
const TELEMETRY_CHARACTERISTIC = '273e000b-4c4d-454d-96be-f03bac821358';
const GYROSCOPE_CHARACTERISTIC = '273e0009-4c4d-454d-96be-f03bac821358';
const ACCELEROMETER_CHARACTERISTIC = '273e000a-4c4d-454d-96be-f03bac821358';
const PPG_CHARACTERISTICS = [
    '273e000f-4c4d-454d-96be-f03bac821358', // ambient 0x37-0x39
    '273e0010-4c4d-454d-96be-f03bac821358', // infrared 0x3a-0x3c
    '273e0011-4c4d-454d-96be-f03bac821358', // red 0x3d-0x3f
];
export const PPG_FREQUENCY = 64;
export const PPG_SAMPLES_PER_READING = 6;
const EEG_CHARACTERISTICS = [
    '273e0003-4c4d-454d-96be-f03bac821358',
    '273e0004-4c4d-454d-96be-f03bac821358',
    '273e0005-4c4d-454d-96be-f03bac821358',
    '273e0006-4c4d-454d-96be-f03bac821358',
    '273e0007-4c4d-454d-96be-f03bac821358',
];
export const EEG_FREQUENCY = 256;
export const EEG_SAMPLES_PER_READING = 12;

// Muse 3 (S Athena) Characteristics
const MUSE3_EEG_CHARACTERISTIC = '273e0013-4c4d-454d-96be-f03bac821358';
const MUSE3_OTHER_CHARACTERISTIC = '273e0014-4c4d-454d-96be-f03bac821358';

// Muse 3 Presets
// p1041, p1042: EEG8 + Optics16 + ACC/GYRO + Battery (bright LED)
// p1035: EEG4 + Optics4 + ACC/GYRO + Battery (dim LED)
// p1034, p1043: EEG8 + Optics8 + ACC/GYRO + Battery (bright LED)
// p1044: EEG8 + Optics8 + ACC/GYRO + Battery (dim LED)
// p20, p21, p50, p51, p60, p61: EEG4 + ACC/GYRO + Battery (LED off)
export type MusePreset =
    | 'p20'
    | 'p21'
    | 'p50'
    | 'p51'
    | 'p60'
    | 'p61'
    | 'p1034'
    | 'p1035'
    | 'p1041'
    | 'p1042'
    | 'p1043'
    | 'p1044'
    | 'p1045'
    | 'p1046'
    | 'p4129';

export enum MuseDeviceType {
    MUSE_1_2_S = 'Muse 1/2/S',
    MUSE_3 = 'Muse 3 (S Athena)',
}

// These names match the characteristics defined in PPG_CHARACTERISTICS above
export const ppgChannelNames = ['ambient', 'infrared', 'red'];

// These names match the characteristics defined in EEG_CHARACTERISTICS above
export const channelNames = ['TP9', 'AF7', 'AF8', 'TP10', 'AUX'];

// Muse 3 channel names (8 EEG channels)
export const muse3ChannelNames = ['TP9', 'AF7', 'AF8', 'TP10', 'FPz', 'AUX_R', 'AUX_L', 'AUX'];

export class MuseClient {
    enableAux = false;
    enablePpg = false;
    deviceName: string | null = '';
    deviceType: MuseDeviceType = MuseDeviceType.MUSE_1_2_S;
    connectionStatus = new BehaviorSubject<boolean>(false);
    rawControlData!: Observable<string>;
    controlResponses!: Observable<MuseControlResponse>;
    telemetryData!: Observable<TelemetryData>;
    gyroscopeData!: Observable<GyroscopeData>;
    accelerometerData!: Observable<AccelerometerData>;
    eegReadings!: Observable<EEGReading>;
    ppgReadings!: Observable<PPGReading>;
    eventMarkers!: Subject<EventMarker>;

    private gatt: BluetoothRemoteGATTServer | null = null;
    private controlChar!: BluetoothRemoteGATTCharacteristic;
    private eegCharacteristics!: BluetoothRemoteGATTCharacteristic[];
    private ppgCharacteristics!: BluetoothRemoteGATTCharacteristic[];
    private muse3EegChar?: BluetoothRemoteGATTCharacteristic;
    private muse3OtherChar?: BluetoothRemoteGATTCharacteristic;

    private lastIndex: number | null = null;
    private lastTimestamp: number | null = null;
    private muse3PacketIndex: number = 0;

    async connect(gatt?: BluetoothRemoteGATTServer) {
        console.log('muse-js v4.0.0 - Muse 3 detection enabled');
        if (gatt) {
            this.gatt = gatt;
        } else {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [MUSE_SERVICE] }],
            });
            this.gatt = await device.gatt!.connect();
        }
        this.deviceName = this.gatt.device.name || null;

        const service = await this.gatt.getPrimaryService(MUSE_SERVICE);
        fromEvent(this.gatt.device, 'gattserverdisconnected')
            .pipe(first())
            .subscribe(() => {
                this.gatt = null;
                this.connectionStatus.next(false);
            });

        // Control
        this.controlChar = await service.getCharacteristic(CONTROL_CHARACTERISTIC);
        this.rawControlData = (await observableCharacteristic(this.controlChar)).pipe(
            map((data) => decodeResponse(new Uint8Array(data.buffer))),
            share(),
        );
        this.controlResponses = parseControl(this.rawControlData);

        // Try to detect device type by checking for Muse 3 characteristics
        try {
            this.muse3EegChar = await service.getCharacteristic(MUSE3_EEG_CHARACTERISTIC);
            if (this.muse3EegChar) {
                this.deviceType = MuseDeviceType.MUSE_3;
                console.log('Detected Muse 3 (S Athena) device');
                this.muse3OtherChar = await service.getCharacteristic(MUSE3_OTHER_CHARACTERISTIC);
            }
        } catch {
            this.deviceType = MuseDeviceType.MUSE_1_2_S;
            console.log('Detected Muse 1/2/S (Classic) device');
        }

        // Battery/Telemetry (not available on Muse 3)
        try {
            const telemetryCharacteristic = await service.getCharacteristic(TELEMETRY_CHARACTERISTIC);
            this.telemetryData = (await observableCharacteristic(telemetryCharacteristic)).pipe(map(parseTelemetry));
        } catch (err) {
            console.warn('Telemetry characteristic not available (expected for Muse 3)');
            // Create empty observable for Muse 3
            this.telemetryData = new Subject<TelemetryData>();
        }

        // Gyroscope (not available on Muse 3 via old characteristic)
        try {
            const gyroscopeCharacteristic = await service.getCharacteristic(GYROSCOPE_CHARACTERISTIC);
            this.gyroscopeData = (await observableCharacteristic(gyroscopeCharacteristic)).pipe(map(parseGyroscope));
        } catch (err) {
            console.warn('Gyroscope characteristic not available (expected for Muse 3)');
            this.gyroscopeData = new Subject<GyroscopeData>();
        }

        // Accelerometer (not available on Muse 3 via old characteristic)
        try {
            const accelerometerCharacteristic = await service.getCharacteristic(ACCELEROMETER_CHARACTERISTIC);
            this.accelerometerData = (await observableCharacteristic(accelerometerCharacteristic)).pipe(
                map(parseAccelerometer),
            );
        } catch (err) {
            console.warn('Accelerometer characteristic not available (expected for Muse 3)');
            this.accelerometerData = new Subject<AccelerometerData>();
        }

        this.eventMarkers = new Subject();

        // PPG
        if (this.enablePpg) {
            this.ppgCharacteristics = [];
            const ppgObservables = [];
            const ppgChannelCount = PPG_CHARACTERISTICS.length;
            for (let ppgChannelIndex = 0; ppgChannelIndex < ppgChannelCount; ppgChannelIndex++) {
                const characteristicId = PPG_CHARACTERISTICS[ppgChannelIndex];
                const ppgChar = await service.getCharacteristic(characteristicId);
                ppgObservables.push(
                    (await observableCharacteristic(ppgChar)).pipe(
                        map((data) => {
                            const eventIndex = data.getUint16(0);
                            return {
                                index: eventIndex,
                                ppgChannel: ppgChannelIndex,
                                samples: decodePPGSamples(new Uint8Array(data.buffer).subarray(2)),
                                timestamp: this.getTimestamp(eventIndex, PPG_SAMPLES_PER_READING, PPG_FREQUENCY),
                            };
                        }),
                    ),
                );
                this.ppgCharacteristics.push(ppgChar);
            }
            this.ppgReadings = merge(...ppgObservables);
        }

        // EEG
        this.eegCharacteristics = [];
        const eegObservables = [];

        if (this.deviceType === MuseDeviceType.MUSE_3) {
            console.log('Setting up Muse 3 data streaming...');
            // Combine EEG and Other characteristics for Muse 3
            const muse3Observables = [];

            if (this.muse3EegChar) {
                muse3Observables.push(
                    (await observableCharacteristic(this.muse3EegChar)).pipe(
                        map((data) => {
                            const parsed = parseMuse3Packet(data);
                            return { data, parsed, characteristic: 'EEG' };
                        }),
                    ),
                );
            }

            if (this.muse3OtherChar) {
                muse3Observables.push(
                    (await observableCharacteristic(this.muse3OtherChar)).pipe(
                        map((data) => {
                            const parsed = parseMuse3Packet(data);
                            return { data, parsed, characteristic: 'OTHER' };
                        }),
                    ),
                );
            }

            const muse3Data = merge(...muse3Observables).pipe(share());

            // Extract EEG readings from parsed packets
            this.eegReadings = muse3Data.pipe(
                filter((packet) => packet.parsed !== null && packet.parsed.subpackets.length > 0),
                concatMap((packet) => {
                    const readings: EEGReading[] = [];
                    const timestamp = new Date().getTime();
                    const index = this.muse3PacketIndex++;

                    // Process each subpacket
                    packet.parsed!.subpackets.forEach((subpkt) => {
                        if (subpkt.sensorType === 'EEG') {
                            // subpkt.data is [samples][channels]
                            // We need to transpose it to [channels][samples]
                            const nSamples = subpkt.data.length;
                            const nChannels = subpkt.nChannels;

                            for (let ch = 0; ch < nChannels; ch++) {
                                const samples: number[] = [];
                                for (let s = 0; s < nSamples; s++) {
                                    samples.push(subpkt.data[s][ch]);
                                }

                                readings.push({
                                    electrode: ch,
                                    index,
                                    samples,
                                    timestamp,
                                });
                            }
                        }
                    });

                    return readings;
                }),
            );

            // Extract IMU data (accelerometer and gyroscope) from parsed packets
            const imuData = muse3Data.pipe(
                filter(
                    (packet) =>
                        packet.parsed !== null && packet.parsed.subpackets.some((sp) => sp.sensorType === 'ACCGYRO'),
                ),
                share(),
            );

            this.accelerometerData = imuData.pipe(
                map((packet) => {
                    const accgyroSubpkt = packet.parsed!.subpackets.find((sp) => sp.sensorType === 'ACCGYRO');
                    if (!accgyroSubpkt) {
                        return null;
                    }

                    // data is [samples][6 channels: ax,ay,az,gx,gy,gz]
                    const samples = accgyroSubpkt.data.map((sample) => ({
                        x: sample[0],
                        y: sample[1],
                        z: sample[2],
                    }));

                    return {
                        sequenceId: this.muse3PacketIndex++,
                        samples,
                    };
                }),
                filter((data) => data !== null),
            );

            this.gyroscopeData = imuData.pipe(
                map((packet) => {
                    const accgyroSubpkt = packet.parsed!.subpackets.find((sp) => sp.sensorType === 'ACCGYRO');
                    if (!accgyroSubpkt) {
                        return null;
                    }

                    // data is [samples][6 channels: ax,ay,az,gx,gy,gz]
                    const samples = accgyroSubpkt.data.map((sample) => ({
                        x: sample[3],
                        y: sample[4],
                        z: sample[5],
                    }));

                    return {
                        sequenceId: this.muse3PacketIndex++,
                        samples,
                    };
                }),
                filter((data) => data !== null),
            );

            // Extract PPG data (OPTICS) from parsed packets
            const ppgData = muse3Data.pipe(
                filter(
                    (packet) =>
                        packet.parsed !== null && packet.parsed.subpackets.some((sp) => sp.sensorType === 'OPTICS'),
                ),
                share(),
            );

            this.ppgReadings = ppgData.pipe(
                concatMap((packet) => {
                    const readings: PPGReading[] = [];
                    const timestamp = new Date().getTime();
                    const index = this.muse3PacketIndex++;

                    const opticsSubpkt = packet.parsed!.subpackets.find((sp) => sp.sensorType === 'OPTICS');
                    if (!opticsSubpkt) {
                        return readings;
                    }

                    // data is [samples][channels]
                    const nSamples = opticsSubpkt.data.length;
                    const nChannels = opticsSubpkt.nChannels;

                    // Transform to PPGReading format [channels][samples]
                    for (let ch = 0; ch < nChannels; ch++) {
                        const samples: number[] = [];
                        for (let s = 0; s < nSamples; s++) {
                            samples.push(opticsSubpkt.data[s][ch]);
                        }

                        readings.push({
                            ppgChannel: ch,
                            index,
                            samples,
                            timestamp,
                        });
                    }

                    return readings;
                }),
            );

            console.log('Muse 3 data streaming configured');
        } else {
            // Muse 1/2/S (Classic) EEG characteristics
            const channelCount = this.enableAux ? EEG_CHARACTERISTICS.length : 4;
            for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
                const characteristicId = EEG_CHARACTERISTICS[channelIndex];
                const eegChar = await service.getCharacteristic(characteristicId);
                eegObservables.push(
                    (await observableCharacteristic(eegChar)).pipe(
                        map((data) => {
                            const eventIndex = data.getUint16(0);
                            return {
                                electrode: channelIndex,
                                index: eventIndex,
                                samples: decodeEEGSamples(new Uint8Array(data.buffer).subarray(2)),
                                timestamp: this.getTimestamp(eventIndex, EEG_SAMPLES_PER_READING, EEG_FREQUENCY),
                            };
                        }),
                    ),
                );
                this.eegCharacteristics.push(eegChar);
            }
            this.eegReadings = merge(...eegObservables);
        }

        this.connectionStatus.next(true);
    }

    async sendCommand(cmd: string) {
        await this.controlChar.writeValue(encodeCommand(cmd));
    }

    async start(muse3Preset: MusePreset = 'p1035') {
        if (this.deviceType === MuseDeviceType.MUSE_3) {
            console.log('Initializing Muse 3 with preset:', muse3Preset);
            await this.initializeMuse3(muse3Preset);
        } else {
            await this.pause();
            let preset = 'p21';
            if (this.enablePpg) {
                preset = 'p50';
            } else if (this.enableAux) {
                preset = 'p20';
            }

            await this.controlChar.writeValue(encodeCommand(preset));
            await this.controlChar.writeValue(encodeCommand('s'));
            await this.resume();
        }
    }

    /**
     * Initialize Muse 3 device with proper startup sequence
     * Critical: dc001 must be sent TWICE!
     */
    private async initializeMuse3(preset: MusePreset) {
        const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        try {
            // Version query
            await this.sendCommand('v6');
            await delay(200);

            // Status query
            await this.sendCommand('s');
            await delay(200);

            // Halt/reset
            await this.sendCommand('h');
            await delay(200);

            // Apply preset
            console.log(`Applying Muse 3 preset: ${preset}`);
            await this.sendCommand(preset);
            await delay(200);

            // Status query after preset
            await this.sendCommand('s');
            await delay(200);

            // Start streaming - MUST send dc001 TWICE (critical!)
            console.log('Starting data stream (sending dc001 twice)...');
            await this.sendCommand('dc001');
            await delay(100);
            await this.sendCommand('dc001');
            await delay(100);

            // Optional: Enable low-latency mode
            await this.sendCommand('L1');
            await delay(300);

            // Final status query
            await this.sendCommand('s');
            await delay(200);

            console.log('Muse 3 initialization complete');
        } catch (err) {
            console.error('Error during Muse 3 initialization:', err);
            throw err;
        }
    }

    async pause() {
        await this.sendCommand('h');
    }

    async resume() {
        await this.sendCommand('d');
    }

    async deviceInfo() {
        const resultListener = this.controlResponses
            .pipe(
                filter((r) => !!r.fw),
                take(1),
            )
            .toPromise();
        await this.sendCommand('v1');
        return resultListener as Promise<MuseDeviceInfo>;
    }

    async injectMarker(value: string | number, timestamp: number = new Date().getTime()) {
        await this.eventMarkers.next({ value, timestamp });
    }

    disconnect() {
        if (this.gatt) {
            this.lastIndex = null;
            this.lastTimestamp = null;
            this.gatt.disconnect();
            this.connectionStatus.next(false);
        }
    }

    private getTimestamp(eventIndex: number, samplesPerReading: number, frequency: number) {
        const READING_DELTA = 1000 * (1.0 / frequency) * samplesPerReading;
        if (this.lastIndex === null || this.lastTimestamp === null) {
            this.lastIndex = eventIndex;
            this.lastTimestamp = new Date().getTime() - READING_DELTA;
        }

        // Handle wrap around
        while (this.lastIndex - eventIndex > 0x1000) {
            eventIndex += 0x10000;
        }

        if (eventIndex === this.lastIndex) {
            return this.lastTimestamp;
        }
        if (eventIndex > this.lastIndex) {
            this.lastTimestamp += READING_DELTA * (eventIndex - this.lastIndex);
            this.lastIndex = eventIndex;
            return this.lastTimestamp;
        } else {
            return this.lastTimestamp - READING_DELTA * (this.lastIndex - eventIndex);
        }
    }
}
