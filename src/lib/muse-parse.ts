import { Observable } from 'rxjs';
import { concatMap, filter, map, scan } from 'rxjs/operators';

import { AccelerometerData, GyroscopeData, TelemetryData } from './muse-interfaces';

export function parseControl(controlData: Observable<string>) {
    return controlData.pipe(
        concatMap((data) => data.split('')),
        scan((acc, value) => {
            // Start collecting when we see an opening brace
            if (value === '{') {
                return '{';
            }
            // If we've seen a closing brace, reset and check if this is a new opening brace
            if (acc.indexOf('}') >= 0) {
                return value === '{' ? '{' : '';
            }
            // Otherwise, keep accumulating
            return acc + value;
        }, ''),
        filter((value) => value.indexOf('{') >= 0 && value.indexOf('}') >= 0),
        map((value) => {
            try {
                return JSON.parse(value);
            } catch (err) {
                console.warn('Failed to parse control response as JSON:', value);
                console.warn('Error:', err);
                // Return a minimal valid response object
                return { rc: 0 };
            }
        }),
    );
}

export function decodeUnsigned12BitData(samples: Uint8Array) {
    const samples12Bit = [];
    for (let i = 0; i < samples.length; i++) {
        if (i % 3 === 0) {
            samples12Bit.push((samples[i] << 4) | (samples[i + 1] >> 4));
        } else {
            samples12Bit.push(((samples[i] & 0xf) << 8) | samples[i + 1]);
            i++;
        }
    }
    return samples12Bit;
}

export function decodeUnsigned24BitData(samples: Uint8Array) {
    const samples24Bit = [];
    for (let i = 0; i < samples.length; i = i + 3) {
        samples24Bit.push((samples[i] << 16) | (samples[i + 1] << 8) | samples[i + 2]);
    }
    return samples24Bit;
}

export function decodeEEGSamples(samples: Uint8Array) {
    return decodeUnsigned12BitData(samples).map((n) => 0.48828125 * (n - 0x800));
}

export function decodePPGSamples(samples: Uint8Array) {
    // Decode data packet of one PPG channel.
    // Each packet is encoded with a 16bit timestamp followed by 6
    // samples with a 24 bit resolution.
    return decodeUnsigned24BitData(samples);
}

export function parseTelemetry(data: DataView): TelemetryData {
    return {
        sequenceId: data.getUint16(0),
        batteryLevel: data.getUint16(2) / 512,
        fuelGaugeVoltage: data.getUint16(4) * 2.2,
        // Next 2 bytes are probably ADC millivolt level, not sure
        temperature: data.getUint16(8),
    };
}

function parseImuReading(data: DataView, scale: number) {
    function sample(startIndex: number) {
        return {
            x: scale * data.getInt16(startIndex),
            y: scale * data.getInt16(startIndex + 2),
            z: scale * data.getInt16(startIndex + 4),
        };
    }
    return {
        sequenceId: data.getUint16(0),
        samples: [sample(2), sample(8), sample(14)],
    };
}

export function parseAccelerometer(data: DataView): AccelerometerData {
    return parseImuReading(data, 0.0000610352);
}

export function parseGyroscope(data: DataView): GyroscopeData {
    return parseImuReading(data, 0.0074768);
}
