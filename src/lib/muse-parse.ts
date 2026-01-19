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
    // tslint:disable:no-bitwise
    for (let i = 0; i < samples.length; i++) {
        if (i % 3 === 0) {
            samples12Bit.push((samples[i] << 4) | (samples[i + 1] >> 4));
        } else {
            samples12Bit.push(((samples[i] & 0xf) << 8) | samples[i + 1]);
            i++;
        }
    }
    // tslint:enable:no-bitwise
    return samples12Bit;
}

export function decodeUnsigned24BitData(samples: Uint8Array) {
    const samples24Bit = [];
    // tslint:disable:no-bitwise
    for (let i = 0; i < samples.length; i = i + 3) {
        samples24Bit.push((samples[i] << 16) | (samples[i + 1] << 8) | samples[i + 2]);
    }
    // tslint:enable:no-bitwise
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
    // tslint:disable:object-literal-sort-keys
    return {
        sequenceId: data.getUint16(0),
        batteryLevel: data.getUint16(2) / 512,
        fuelGaugeVoltage: data.getUint16(4) * 2.2,
        // Next 2 bytes are probably ADC millivolt level, not sure
        temperature: data.getUint16(8),
    };
    // tslint:enable:object-literal-sort-keys
}

function parseImuReading(data: DataView, scale: number) {
    function sample(startIndex: number) {
        return {
            x: scale * data.getInt16(startIndex),
            y: scale * data.getInt16(startIndex + 2),
            z: scale * data.getInt16(startIndex + 4),
        };
    }
    // tslint:disable:object-literal-sort-keys
    return {
        sequenceId: data.getUint16(0),
        samples: [sample(2), sample(8), sample(14)],
    };
    // tslint:enable:object-literal-sort-keys
}

export function parseAccelerometer(data: DataView): AccelerometerData {
    return parseImuReading(data, 0.0000610352);
}

export function parseGyroscope(data: DataView): GyroscopeData {
    return parseImuReading(data, 0.0074768);
}

// ===================================
// Muse 3 (S Athena) Packet Parsers
// ===================================

/**
 * Muse 3 channel names for 8-channel EEG
 */
const MUSE3_CHANNEL_NAMES = ['TP9', 'AF7', 'AF8', 'TP10', 'FPz', 'AUX_R', 'AUX_L', 'AUX'];

/**
 * Decodes 12 EEG samples from 18 bytes for Muse 3
 * Each 3 bytes contain two 12-bit samples
 */
export function decodeMuse3EEGSamples(data: Uint8Array): number[] {
    const samples: number[] = [];
    const EEG_SCALE = 1000.0 / 2048.0; // Convert to microvolts

    for (let i = 0; i < 6; i++) {
        const offset = i * 3;
        if (offset + 3 <= data.length) {
            const b0 = data[offset];
            const b1 = data[offset + 1];
            const b2 = data[offset + 2];

            // Extract two 12-bit samples from 3 bytes
            const sample1 = (b0 << 4) | (b1 >> 4);
            const sample2 = ((b1 & 0x0f) << 8) | b2;

            // Convert to microvolts
            samples.push((sample1 - 2048) * EEG_SCALE);
            samples.push((sample2 - 2048) * EEG_SCALE);
        }
    }

    return samples;
}

/**
 * Checks if a segment looks like EEG data
 */
function looksLikeEEG(segment: Uint8Array): boolean {
    if (segment.length !== 18) {
        return false;
    }

    // Check first sample range
    const sample = (segment[0] << 4) | (segment[1] >> 4);
    return sample > 1000 && sample < 3000;
}

/**
 * Decodes PPG samples from 20-byte segment
 */
function decodeMuse3PPGSamples(data: Uint8Array): number[] {
    if (data.length < 20) {
        return [];
    }

    const samples: number[] = [];

    // Extract PPG samples (simplified to 16-bit for performance)
    for (let i = 0; i < 18; i += 3) {
        if (i + 1 < data.length) {
            const val = (data[i] << 8) | data[i + 1];
            if (val > 10000) {
                // PPG range check
                samples.push(val);
            }
        }
    }

    return samples.length > 2 ? samples : [];
}

export interface Muse3ParsedPacket {
    packetType: string;
    eegChannels?: Map<string, number[]>; // Map of channel name to samples
    ppgSamples?: number[];
    accelerometer?: { x: number; y: number; z: number };
    gyroscope?: { x: number; y: number; z: number };
}

// Stats tracking
let dfPacketCount = 0;
const _f4PacketCount = 0;

/**
 * Parse Muse 3 0xDF packet (EEG + PPG combined)
 * Format: [0xDF][3 byte header][EEG segments][PPG segments]
 */
export function parseMuse3Type0xDF(data: DataView): Muse3ParsedPacket {
    dfPacketCount++;

    const result: Muse3ParsedPacket = {
        packetType: 'EEG_PPG',
        eegChannels: new Map(),
    };

    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    if (debugMode && dfPacketCount % 100 === 0) {
        console.log(`Processed ${dfPacketCount} 0xDF packets, packet size: ${bytes.length} bytes`);
    }

    // Skip header (4 bytes)
    let offset = 4;
    let channelCount = 0;

    // Extract EEG segments (18 bytes each) and PPG segments (20 bytes each)
    while (offset < bytes.length && channelCount < 8) {
        // Try EEG segment (18 bytes)
        if (offset + 18 <= bytes.length && looksLikeEEG(bytes.subarray(offset, offset + 18))) {
            const samples = decodeMuse3EEGSamples(bytes.subarray(offset, offset + 18));
            const channelName = MUSE3_CHANNEL_NAMES[channelCount] || `ch${channelCount}`;
            result.eegChannels!.set(channelName, samples);
            channelCount++;
            offset += 18;

            if (debugMode && dfPacketCount <= 5) {
                console.log(`  Found EEG channel ${channelName}, samples[0]: ${samples[0].toFixed(2)}µV`);
            }
        }
        // Try PPG segment (20 bytes)
        else if (offset + 20 <= bytes.length) {
            const ppgSamples = decodeMuse3PPGSamples(bytes.subarray(offset, offset + 20));
            if (ppgSamples.length > 0) {
                result.ppgSamples = ppgSamples;
                offset += 20;
            } else {
                offset += 1; // Skip one byte if not PPG
            }
        } else {
            break; // Not enough data left
        }
    }

    if (debugMode && dfPacketCount <= 5) {
        console.log(
            `  0xDF packet parsed: ${channelCount} EEG channels, ${result.ppgSamples ? 'PPG present' : 'no PPG'}`,
        );
    }

    return result;
}

/**
 * Parse Muse 3 0xF4 packet (IMU data)
 * Format: [0xF4][3 byte header][6 int16 values: ax,ay,az,gx,gy,gz]
 */
export function parseMuse3Type0xF4(data: DataView): Muse3ParsedPacket {
    const result: Muse3ParsedPacket = {
        packetType: 'IMU',
    };

    if (data.byteLength < 16) {
        return result;
    }

    const IMU_SCALE = 0.01; // 1.0 / 100.0
    const offset = 4; // Skip header

    try {
        // Read 6 int16 values (big-endian)
        const ax = data.getInt16(offset, false); // false = big-endian
        const ay = data.getInt16(offset + 2, false);
        const az = data.getInt16(offset + 4, false);
        const gx = data.getInt16(offset + 6, false);
        const gy = data.getInt16(offset + 8, false);
        const gz = data.getInt16(offset + 10, false);

        result.accelerometer = {
            x: ax * IMU_SCALE,
            y: ay * IMU_SCALE,
            z: az * IMU_SCALE,
        };

        result.gyroscope = {
            x: gx * IMU_SCALE,
            y: gy * IMU_SCALE,
            z: gz * IMU_SCALE,
        };
    } catch (err) {
        console.warn('Error parsing Muse 3 IMU packet:', err);
    }

    return result;
}

/**
 * Parse Muse 3 0xDB packet (Mixed sensors)
 */
export function parseMuse3Type0xDB(_data: DataView): Muse3ParsedPacket {
    // These packets often contain mixed sensor data
    // For now, try generic decoding
    return {
        packetType: 'MIXED_1',
    };
}

/**
 * Parse Muse 3 0xD9 packet (Mixed sensors)
 */
export function parseMuse3Type0xD9(_data: DataView): Muse3ParsedPacket {
    // Similar to 0xDB
    return {
        packetType: 'MIXED_2',
    };
}

// Track unknown packet types to avoid console spam
const unknownPacketTypes = new Set<number>();
let debugMode = false;

/**
 * Enable debug logging for Muse 3 packets
 */
export function setMuse3DebugMode(enabled: boolean) {
    debugMode = enabled;
}

/**
 * Main parser for Muse 3 packets
 * Identifies packet type and routes to appropriate parser
 */
export function parseMuse3Packet(data: DataView): Muse3ParsedPacket | null {
    if (data.byteLength === 0) {
        return null;
    }

    const packetType = data.getUint8(0);

    // IMU packets are smaller and distinct
    if (packetType === 0xf4) {
        if (debugMode) console.log('Parsing 0xF4 packet (IMU)');
        return parseMuse3Type0xF4(data);
    }

    // All large packets (200+ bytes) likely contain EEG data
    // The Muse 3 multiplexes EEG channels across many different packet types!
    if (data.byteLength >= 150) {
        // Treat as EEG packet - try to extract EEG channels
        if (debugMode && unknownPacketTypes.has(packetType) === false) {
            console.log(`Parsing 0x${packetType.toString(16)} as EEG packet (size: ${data.byteLength})`);
        }
        unknownPacketTypes.add(packetType); // Mark as seen
        return parseMuse3Type0xDF(data); // Use same parser for all EEG packets
    }

    // Small packets - control/status data
    switch (packetType) {
        case 0xdb:
            return parseMuse3Type0xDB(data);
        case 0xd9:
            return parseMuse3Type0xD9(data);
        default:
            // Only log truly unknown small packets once
            if (!unknownPacketTypes.has(packetType)) {
                unknownPacketTypes.add(packetType);
                if (debugMode) {
                    console.warn(
                        `Unknown small packet type: 0x${packetType.toString(16)} (size: ${data.byteLength} bytes)`,
                    );
                }
            }
            return null;
    }
}
