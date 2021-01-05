import { DLS, MIDI } from "./chunk";
import { getFrequencyFromNoteID, InstrumentData, ParseResult as DLSParseInfo } from './dls';
import { ParseResult as MidiParseInfo } from "./midi";

export namespace Synthesizer {

    function getBigEndianNumberFromUint8Array(data : Uint8Array, offset : number, size : number) {
        let ret = 0;
        for (let i = 0; i < size; i++) {
            ret = (ret << 8) + data[offset + i];
        }
        return ret;
    }

    function getLittleEndianNumberFromUint8Array(data : Uint8Array, offset : number, size : number) {
        let ret = 0;
        for (let i = 0; i < size; i++) {
            ret += data[offset + i] << (i * 8);
        }
        return ret;
    }
    
    function setLittleEndianNumberToUint8Array(data : Uint8Array, offset : number, size : number, value : number) {
        for (let i = 0; i < size; i++) {
            data.set([(value >> (i * 8)) & 0xff], offset+i);
        }
    }
    
    export function getSecondsFromArt1Scale(lScale: number) {
        if (lScale === -0x80000000) {
            return 0;
        }
        return 2 ** (lScale / 1200 / 65536);
    }

    function getFrequencyFromArt1CentScale(lScale: number) {
        return 440 * (2 ** ((lScale / 65536 - 6900)/1200));
    }
    
    export class Art1Info {
        EG1AttackTime   : number = 0;
        EG1DecayTime    : number = 0;
        EG1ReservedTime : number = 0;
        EG1ReleaseTime  : number = 0;
        EG1SustainLevel : number = 100.0;
        EG1KeyToDecay   : number = 0;
    
        EG2AttackTime   : number = 0;
        EG2DecayTime    : number = 0;
        EG2ReservedTime : number = 0;
        EG2ReleaseTime  : number = 0;
        EG2SustainLevel : number = 100.0;
        EG2KeyToDecay   : number = 0;

        LFOFrequency : number = 5.0;
        LFOPitch     : number = 0;
        LFODelay     : number = 0;

        EG2ToPitch : number = 0;

        PitchPerModWheel : number = 0;
    }
    
    export function getArt1InfoFromLarts(lart?: DLS.LartChunk) : Art1Info {
        const ret = new Art1Info();
        if (!lart || !lart.art1List) return ret;
        const art1s = lart.art1List;
        art1s.forEach(art1 => {
            art1.connectionBlocks.forEach(cb => {
                switch (cb.usDestination) {
                    case DLS.ART1DESTINATION.CONN_LFO_FREQUENCY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.LFOFrequency = getFrequencyFromArt1CentScale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_LFO_DELAY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.LFODelay = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_ATTACK:
                        if (cb.usSource == DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1AttackTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_DECAY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1DecayTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            ret.EG1KeyToDecay = getSecondsFromArt1Scale(cb.lScale);
                            console.log('CONN_EG1_DECAY', 'CONN_SRC_KEYNUMBER', cb.lScale, getFrequencyFromArt1CentScale(cb.lScale));
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_RESERVED:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : おそらくここで定義されているのがSUSTAIN_LEVEL
                            ret.EG1SustainLevel = Math.max(0, Math.min(100.0, cb.lScale / 10));
                            if (cb.lScale < 0 || cb.lScale > 1000) {
                                console.warn('CONN_EG1_RESERVED', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            }
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_RELEASE:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1ReleaseTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_SUSTAIN:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1ReservedTime = getSecondsFromArt1Scale(cb.lScale);
                            console.warn('CONN_EG1_SUSTAIN', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_ATTACK:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2AttackTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_DECAY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2DecayTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            ret.EG2KeyToDecay = getSecondsFromArt1Scale(cb.lScale);
                            console.warn('CONN_EG2_DECAY', 'CONN_SRC_KEYNUMBER', cb.lScale, getFrequencyFromArt1CentScale(cb.lScale));
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_RESERVED:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : おそらくここで定義されているのがSUSTAIN_LEVEL
                            ret.EG2SustainLevel = Math.max(0, Math.min(100.0, cb.lScale / 10));
                            if (cb.lScale < 0 || cb.lScale > 1000) {
                                console.error('CONN_EG2_RESERVED', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            }
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_RELEASE:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2ReleaseTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_SUSTAIN:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2ReservedTime = getSecondsFromArt1Scale(cb.lScale);
                            console.warn('CONN_EG2_SUSTAIN', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_DST_PITCH:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_LFO) {
                            // LFO Pitch
                            ret.LFOPitch = getFrequencyFromArt1CentScale(cb.lScale);
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_EG2) {
                            // EG2 Value to Pitch (max pitch delta)
                            ret.EG2ToPitch = getFrequencyFromArt1CentScale(cb.lScale);
                            return;
                        }
                        break;
                }
                console.warn('Unknown ART1 Destination', cb);
            })
        })
        return ret;
    }

    class NoteInfo {
        noteID : number;
        velocity : number;
        endTick   : number;
        endOffset : number;
        length : number;
    }

    class InstrumentInfo {
        instrumentID : number = 0;
        bankID : number = 0;
        volume : number = 100;

        constructor(data? : Partial<InstrumentInfo>) {
            Object.assign(this, data);
        }
    }

    export function synthesizeMIDI(midi : MidiParseInfo, dls : DLSParseInfo) :  Uint8Array {
        const riffData = new Array<number>(); // uint8
        const waveData = new Array<number>(); // int16
        riffData[0] = 'R'.charCodeAt(0);
        riffData[1] = 'I'.charCodeAt(0);
        riffData[2] = 'F'.charCodeAt(0);
        riffData[3] = 'F'.charCodeAt(0);
        riffData[8]  = 'W'.charCodeAt(0);
        riffData[9]  = 'A'.charCodeAt(0);
        riffData[10] = 'V'.charCodeAt(0);
        riffData[11] = 'E'.charCodeAt(0);
        riffData[12] = 'f'.charCodeAt(0);
        riffData[13] = 'm'.charCodeAt(0);
        riffData[14] = 't'.charCodeAt(0);
        riffData[15] = ' '.charCodeAt(0);
        riffData[16] = 16;   // fmt block in 20-32
        riffData[17] = 0;
        riffData[18] = 0;
        riffData[19] = 0;
        riffData[20] = 1;    // linear PCM
        riffData[21] = 0;
        riffData[22] = 1;    // Monoral
        riffData[23] = 0;
        riffData[24] = 0x44; // 44100
        riffData[25] = 0xAC;
        riffData[26] = 0x00;
        riffData[27] = 0x00;
        riffData[28] = 0x88; // 88200
        riffData[29] = 0x58;
        riffData[30] = 0x01;
        riffData[31] = 0x00;
        riffData[32] = 2;    // 2byte
        riffData[33] = 0;
        riffData[34] = 16;   // 16bit
        riffData[35] = 0;
        riffData[36] = 'd'.charCodeAt(0);
        riffData[37] = 'a'.charCodeAt(0);
        riffData[38] = 't'.charCodeAt(0);
        riffData[39] = 'a'.charCodeAt(0);
        riffData[40] = 0;
        riffData[41] = 0;
        riffData[42] = 0;
        riffData[43] = 0;

        // tick -> tempo change Info(number)
        const tickTempoMap = new Map<number, number>();
        // channel ID -> tick -> Instrument Info
        const tickInstrumentMap = new Map<number, Map<number, InstrumentInfo>>();
        // channel ID -> tick
        const channelToInstrumentLastTick = new Map<number, number>();
        // channel ID -> tick -> [Note info]
        const tickNotesMap = new Map<number, Map<number, Array<NoteInfo>>>();
        // channel ID -> Note ID -> tick
        const channelToNoteLastTick = new Map<number, Map<number, number>>();

        // Truckを見てChannel -> tick -> 各種データを集める
        let maxTick = 0;
        midi.mtrks.forEach(mtrk => {
            let tick = 0;
            mtrk.Events.forEach(mtrkEvent => {
                tick += mtrkEvent.deltaTime;
                if (mtrkEvent.event instanceof MIDI.MIDIEvent) {
                    if (mtrkEvent.event.isNoteEvent) {
                        if (mtrkEvent.event.velocity > 0) {
                            // NOTE ON
                            const noteInfo = new NoteInfo();
                            noteInfo.noteID = mtrkEvent.event.noteID;
                            noteInfo.velocity = mtrkEvent.event.velocity;
                            if(!tickNotesMap.get(mtrkEvent.event.channel))tickNotesMap.set(mtrkEvent.event.channel, new Map());
                            if(!tickNotesMap.get(mtrkEvent.event.channel).get(tick)) {
                                tickNotesMap.get(mtrkEvent.event.channel).set(tick, new Array());
                            }
                            tickNotesMap.get(mtrkEvent.event.channel).get(tick).push(noteInfo);
                            if(!channelToNoteLastTick.get(mtrkEvent.event.channel))channelToNoteLastTick.set(mtrkEvent.event.channel, new Map());
                            channelToNoteLastTick.get(mtrkEvent.event.channel).set(noteInfo.noteID, tick);
                        } else {
                            // NOTE OFF
                            const noteID = mtrkEvent.event.noteID;
                            const lastTick = channelToNoteLastTick.get(mtrkEvent.event.channel).get(noteID);
                            const noteInfo = tickNotesMap.get(mtrkEvent.event.channel).get(lastTick).find(nInfo => noteID === nInfo.noteID);
                            noteInfo.endTick = tick;
                            noteInfo.length = tick - lastTick;
                        }
                    } else if (mtrkEvent.event.isControlEvent) {
                        if (mtrkEvent.event.controlCommand === 0x00 || mtrkEvent.event.controlCommand === 0x20) {
                            // BANK Select (0x00 -> LSB, 0x20 -> MSB)
                            const lastTick = channelToInstrumentLastTick.get(mtrkEvent.event.channel);
                            let instrumentInfo = new InstrumentInfo();
                            if (lastTick) {
                                let lastInstrument = tickInstrumentMap.get(mtrkEvent.event.channel).get(lastTick);
                                instrumentInfo = new InstrumentInfo(lastInstrument);
                            }
                            if (mtrkEvent.event.controlCommand === 0x00) {
                                // LSB
                                instrumentInfo.bankID = instrumentInfo.bankID & 0xFF00 + mtrkEvent.event.value1;
                            } else {
                                // MSB
                                instrumentInfo.bankID = instrumentInfo.bankID & 0x00FF + (mtrkEvent.event.value1 << 8);
                            }
                            if (!tickInstrumentMap.get(mtrkEvent.event.channel)) tickInstrumentMap.set(mtrkEvent.event.channel, new Map());
                            tickInstrumentMap.get(mtrkEvent.event.channel).set(tick, instrumentInfo);
                            channelToInstrumentLastTick.set(mtrkEvent.event.channel, tick);
                        } else if (mtrkEvent.event.controlCommand === 0x07) {
                            // Volume
                            const lastTick = channelToInstrumentLastTick.get(mtrkEvent.event.channel);
                            let instrumentInfo = new InstrumentInfo();
                            if (lastTick) {
                                let lastInstrument = tickInstrumentMap.get(mtrkEvent.event.channel).get(lastTick);
                                instrumentInfo = new InstrumentInfo(lastInstrument);
                            }
                            instrumentInfo.volume = mtrkEvent.event.value1;
                            if (!tickInstrumentMap.get(mtrkEvent.event.channel)) tickInstrumentMap.set(mtrkEvent.event.channel, new Map());
                            tickInstrumentMap.get(mtrkEvent.event.channel).set(tick, instrumentInfo);
                            channelToInstrumentLastTick.set(mtrkEvent.event.channel, tick);
                        }
                    } else if (mtrkEvent.event.isProgramChangeEvent) {
                        // Program ID
                        const lastTick = channelToInstrumentLastTick.get(mtrkEvent.event.channel);
                        let instrumentInfo = new InstrumentInfo();
                        if (lastTick) {
                            let lastInstrument = tickInstrumentMap.get(mtrkEvent.event.channel).get(lastTick);
                            instrumentInfo = new InstrumentInfo(lastInstrument);
                        }
                        instrumentInfo.instrumentID = mtrkEvent.event.programID;
                        if (!tickInstrumentMap.get(mtrkEvent.event.channel)) tickInstrumentMap.set(mtrkEvent.event.channel, new Map());
                        tickInstrumentMap.get(mtrkEvent.event.channel).set(tick, instrumentInfo);
                        channelToInstrumentLastTick.set(mtrkEvent.event.channel, tick);
                    }
                } else if (mtrkEvent.event instanceof MIDI.SysExEvent) {
                } else if (mtrkEvent.event instanceof MIDI.MetaEvent) {
                    if (mtrkEvent.event.metaEventType === 0x51) {
                        // tempo event
                        const tempo = getBigEndianNumberFromUint8Array(mtrkEvent.event.value, 0, mtrkEvent.event.value.length);
                        tickTempoMap.set(tick, tempo);
                    }
                } else {
                    throw new Error();
                }
            });
            maxTick = Math.max(maxTick, tick);
        });

        const channelIDs = new Set<number>();
        tickInstrumentMap.forEach((_, channelID) => channelIDs.add(channelID));
        tickNotesMap.forEach((_, channelID) => channelIDs.add(channelID));

        const notePerTick = midi.mthd.division; // ticks per 1/4 note (ex. 480)

        // tick(number) -> offset(number)
        const tickToOffset = new Map<number, number>();
        let tempo = 400000; // μs per 1/4 note (ex. 600000 for 100/min, 200000 for 300/min)
        let offset = 0;
        let maxOffset = 0;
        for (let tick = 0; tick <= maxTick; tick++) {
            const tempoEvent = tickTempoMap.get(tick);
            if (tempoEvent) {
                tempo = tempoEvent;
            }
            offset += (1 / notePerTick) * (tempo / 1000000) * 44100;
            if (tempoEvent) console.log(tick, tempo, offset);
            tickToOffset.set(tick, offset);
            maxOffset = Math.max(maxOffset, offset);
        }

        // channel ID -> offset -> Instrument Info
        const offsetInstrumentMap = new Map<number, Map<number, InstrumentInfo>>();

        tickInstrumentMap.forEach((map, channelID) => {
            offsetInstrumentMap.set(channelID, new Map());
            map.forEach((instrumentInfo, tick) => {
                const offset = Math.trunc(tickToOffset.get(tick));
                offsetInstrumentMap.get(channelID).set(offset, instrumentInfo);
            });
        });

        // channel ID -> offset -> [Note info]
        const offsetNotesMap = new Map<number, Map<number, Array<NoteInfo>>>();

        tickNotesMap.forEach((map, channelID) => {
            offsetNotesMap.set(channelID, new Map());
            map.forEach((noteInfoArray, tick) => {
                noteInfoArray.forEach(noteInfo => {
                    const offset = Math.trunc(tickToOffset.get(tick));
                    noteInfo.endOffset = Math.trunc(tickToOffset.get(noteInfo.endTick));
                    noteInfo.length = noteInfo.endOffset - offset;
                    if(!offsetNotesMap.get(channelID).get(offset))offsetNotesMap.get(channelID).set(offset, new Array());
                    offsetNotesMap.get(channelID).get(offset).push(noteInfo);
                })
            });
        });

        // channelID -> noteID -> [attacked offset, valocity, position_dx]
        const noteIDAttackedOffsetMap = new Map<number, Map<number, [number, NoteInfo, number]>>();
        channelIDs.forEach(channelID => {
            noteIDAttackedOffsetMap.set(channelID, new Map<number, [number, NoteInfo, number]>());
        })
        // channelID -> [instrument, wave]
        const instrumentMap = new Map<number, [InstrumentInfo, InstrumentData, Art1Info, DLS.LartChunk]>();
        let waveDataMin = 1;
        let waveDataMax = -1;
        for (let offset = 0; offset < maxOffset; offset++) {
            if (offset % 10000 === 0)console.log("Synthesize Processing... ", offset, "/", maxOffset);
            waveData[offset] = 0;
            
            channelIDs.forEach((channelID) => {
                if (channelID === 9) return; // 打楽器パートは未対応
                // if (channelID !== 0) return; // 仮置
                const instrumentEvent = offsetInstrumentMap.get(channelID)?.get(offset);
                if (instrumentEvent) {
                    const instrumentData = dls.instrumentIDMap.get(instrumentEvent.instrumentID).get(instrumentEvent.bankID);
                    instrumentMap.set(channelID, [instrumentEvent, instrumentData, getArt1InfoFromLarts(instrumentData.insChunk.lart), instrumentData.insChunk.lart]);
                }
                const noteEvents = offsetNotesMap.get(channelID)?.get(offset);
                if (noteEvents) {
                    noteEvents.forEach(noteEvent => {
                        noteIDAttackedOffsetMap.get(channelID).set(noteEvent.noteID, [offset, noteEvent, 0]);
                    })
                }
                const attackedMap = noteIDAttackedOffsetMap.get(channelID);
                if (attackedMap) {
                    const instData = instrumentMap.get(channelID);
                    let instrumentInfo : InstrumentInfo;
                    let instrumentData : InstrumentData;
                    let art1Info       : Art1Info;
                    let lart           : DLS.LartChunk;
                    if (instData) {
                        [instrumentInfo, instrumentData, art1Info, lart] = instrumentMap.get(channelID);
                    }
                    attackedMap?.forEach(([attackedOffset, noteInfo, positionDX], noteID) => {
                        if (!instData) return;
                        const position = offset - attackedOffset;
                        const positionFromReleased = offset - noteInfo.endOffset;
                        const sec = position / 44100;
                        const secFromReleased = positionFromReleased / 44100;
                        const rgn = instrumentData.regionMap.get(noteID).get(noteInfo.velocity);
                        if (!rgn) {
                            // rgnが存在しないなどないはず
                            console.error("not defined RGN", noteID, noteInfo.velocity, instrumentData.regionMap);
                            noteIDAttackedOffsetMap.get(channelID).delete(noteID);
                            return;
                        }
                        if (!lart && rgn.lart) {
                            // lartが存在しない -> regionごとのlartがあったらそっちを取得
                            art1Info = getArt1InfoFromLarts(rgn.lart);
                        } else if (!lart && !rgn.lart) {
                            console.log("no ins lart nor rgn lart", instrumentInfo.instrumentID, rgn);
                        }
                        if (secFromReleased >= art1Info.EG1ReleaseTime) {
                            noteIDAttackedOffsetMap.get(channelID).delete(noteID);
                        } else {
                            const waveInfo = instrumentData.waves.find(waveInfo => waveInfo.id === rgn.wlnk.ulTableIndex);
                            if (!waveInfo) {
                                console.error("cannot load waveInfo from ", rgn);
                                noteIDAttackedOffsetMap.get(channelID).delete(noteID);
                                return;
                            }
                            const bps = waveInfo.wave.bytesPerSecond;
                            const wsmp = rgn.wsmp;
                            let waveLoopStart = 0;
                            let waveLoopLength = 0;
                            let waveLooping = false;
                            let freqRate = 1;
                            if (wsmp) {
                                const altFreq = getFrequencyFromNoteID(noteID);
                                freqRate = altFreq / getFrequencyFromNoteID(wsmp.usUnityNote);
                                if (wsmp.waveSampleLoop) {
                                    waveLooping = true;
                                    waveLoopStart = wsmp.waveSampleLoop.ulLoopStart;
                                    waveLoopLength = wsmp.waveSampleLoop.ulLoopLength;
                                }
                            }
                            if (!lart) {
                                // lartが存在しない -> regionごとのlartがあったらそっちを取得
                                art1Info = getArt1InfoFromLarts(rgn.lart);
                            }
                            // EG2(Envelope Generator for Pitch)情報をpositionDXに雑に適用
                            if (art1Info) {
                                let ddx = 0;
                                if (art1Info.EG2ToPitch) {
                                    if (art1Info.EG2AttackTime > 0 || art1Info.EG2DecayTime > 0 || art1Info.EG2ReleaseTime > 0) {
                                        if (sec < art1Info.EG2AttackTime) {
                                            // Attack Zone
                                            if (sec === 0) {
                                                ddx = 0
                                            } else {
                                                ddx = art1Info.EG2ToPitch * sec / art1Info.EG2AttackTime;
                                            }
                                        } else if (positionFromReleased <= 0) {
                                            // Decay or Sustain Zone
                                            if (sec === 0 || art1Info.EG2DecayTime === 0) {
                                                ddx = 0;
                                            } else {
                                                if (sec === art1Info.EG2AttackTime) {
                                                    ddx = art1Info.EG2ToPitch;
                                                } else {
                                                    ddx = art1Info.EG2ToPitch * (sec - art1Info.EG2AttackTime) / (art1Info.EG2DecayTime);
                                                }
                                            }
                                            ddx = Math.max(ddx, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0);
                                        } else {
                                            // Sustain or Release Zone
                                            let dddx = art1Info.EG2ToPitch;
                                            if (sec === 0 || art1Info.EG2DecayTime === 0) {
                                                dddx = 0;
                                            } else {
                                                if (sec !== art1Info.EG2AttackTime) {
                                                    dddx = art1Info.EG2ToPitch * (sec - art1Info.EG2AttackTime) / (art1Info.EG2DecayTime);
                                                }
                                            }
                                            dddx = Math.max(dddx, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0);
                                            if (art1Info.EG2ReleaseTime === 0) {
                                                ddx = 0;
                                            } else {
                                                if (noteInfo.endOffset === offset) {
                                                    ddx = dddx;
                                                } else {
                                                    ddx = art1Info.EG2ToPitch * -Math.log10(secFromReleased / (art1Info.EG2ReleaseTime));
                                                }
                                            }
                                            ddx = Math.min(ddx, dddx);
                                        }
                                        // ddx : offset単位
                                        ddx = Math.max(0, Math.min(art1Info.EG2ToPitch, ddx)) / bps;
                                    }

                                }
                                // positionDX更新
                                // dx : offset単位
                                noteIDAttackedOffsetMap.get(channelID).set(noteID, [attackedOffset, noteInfo, positionDX - ddx * (bps / 44100)]);
                                // console.log(offset, position, position * (bps / 44100) * freqRate, positionDX, ddx, sec, bps, art1Info.EG2ToPitch);
                            }
                            let sampleOffset = Math.max(0, position * (bps / 44100) * freqRate + positionDX);
                            if (waveLooping && sampleOffset >= waveInfo.wave.pcmData.length -1) {
                                sampleOffset = ((sampleOffset - waveInfo.wave.pcmData.length) % waveLoopLength) + waveLoopStart;
                            } else if (!waveLooping && sampleOffset >= waveInfo.wave.pcmData.length-1) {
                                console.warn("sampleOffset is out of BOUND", sampleOffset );
                                noteIDAttackedOffsetMap.get(channelID).delete(noteID);
                                return;
                            }
                            // TODO : 一旦「線形補間」
                            let sampleWaveData = 0;
                            if (Number.isInteger(sampleOffset)) {
                                sampleWaveData = waveInfo.wave.pcmData[sampleOffset];
                            } else {
                                const x1 = Math.trunc(sampleOffset);
                                const x2 = Math.ceil(sampleOffset);
                                const y1 = waveInfo.wave.pcmData[x1];
                                const y2 = waveInfo.wave.pcmData[x2];
                                sampleWaveData = (x2 - sampleOffset) * y1 + (sampleOffset - x1) * y2;
                            }
                            sampleWaveData = Math.round(sampleWaveData * (noteInfo.velocity / 100));
                            // EG1(Envelope Generator for Volume)情報を反映
                            let eg1Velocity = 1.0;
                            if (art1Info) {
                                let decayTime = art1Info.EG1DecayTime;
                                if (art1Info.EG1KeyToDecay > 0) {
                                    decayTime += art1Info.EG1KeyToDecay * (noteInfo.noteID / 128);
                                }
                                if (sec < art1Info.EG1AttackTime) {
                                    // Attack Zone
                                    eg1Velocity = sec / art1Info.EG1AttackTime;
                                } else if (positionFromReleased <= 0) {
                                    // Decay or Sustain Zone
                                    if (sec === 0 || decayTime === 0) {
                                        eg1Velocity = 0;
                                    } else {
                                        if (sec === art1Info.EG1AttackTime) {
                                            eg1Velocity = 1.0;
                                        } else {
                                            eg1Velocity = -Math.log10((sec - art1Info.EG1AttackTime) / decayTime + 0.1);
                                        }
                                    }
                                    eg1Velocity = Math.max(eg1Velocity, art1Info.EG1SustainLevel / 100.0);
                                } else {
                                    // Sustain or Release Zone
                                    let dVolume = 1.0;
                                    if (sec === 0 || decayTime === 0) {
                                        dVolume = 0;
                                    } else {
                                        if (sec === art1Info.EG1AttackTime) {
                                            dVolume = 1.0;
                                        } else {
                                            dVolume = -Math.log10(Math.max(0, (sec - art1Info.EG1AttackTime)) / decayTime + 0.1);
                                        }
                                    }
                                    dVolume = Math.max(dVolume, art1Info.EG1SustainLevel / 100.0);
                                    if (art1Info.EG1ReleaseTime === 0) {
                                        eg1Velocity = 0;
                                    } else {
                                        if (offset === noteInfo.endOffset) {
                                            eg1Velocity = dVolume;
                                        } else {
                                            eg1Velocity = -Math.log10(Math.max(0, secFromReleased) / (art1Info.EG1ReleaseTime) + 0.1);
                                        }
                                    }
                                    eg1Velocity = Math.min(eg1Velocity, dVolume);
                                }
                                eg1Velocity = Math.min(1.0, Math.max(0, eg1Velocity));
                            }
                            // LFO情報を反映
                            let lfo = 0;
                            // if (art1Info) {
                            //     if (art1Info.LFOPitch > 0) {
                            //         // 遅延が存在する場合は遅延時間以降でサインカーブを生成
                            //         if (sec >= art1Info.LFODelay) {
                            //             lfo = Math.sin((sec - art1Info.LFODelay) * Math.PI * 2 / art1Info.LFOFrequency) * (32768 * art1Info.LFOPitch);
                            //         }
                            //     } 
                            // }
                            sampleWaveData = ((sampleWaveData + lfo) * eg1Velocity) * (instrumentInfo.volume / 100.0);
                            if (isNaN(sampleWaveData)) {
                                console.error(offset, eg1Velocity, lfo, sampleOffset, sampleWaveData, art1Info.EG1ReleaseTime, instrumentInfo.volume );
                            }
                            waveData[offset] += sampleWaveData;
                            // console.log(offset, attackedOffset, noteInfo, positionDX, art1Info, wsmp, position, sampleOffset, freqRate, sampleWaveData, eg1Velocity, waveLoopLength, waveLoopStart, waveInfo.wave.pcmData.length);
                        }
                    });
                }
            });
            if (waveData[offset]) {
                waveDataMax = Math.max(waveDataMax, waveData[offset]);
                waveDataMin = Math.min(waveDataMin, waveData[offset]);
            }
        }

        // -32768~32767に範囲をおさえる(音割れ防止)
        const correctRate = Math.min(32767 / waveDataMax, -32768 / waveDataMin);
        console.log(waveDataMax, waveDataMin, correctRate);
        if (correctRate < 1) {
            for (let offset = 0; offset < maxOffset; offset++) {
                waveData[offset] *= correctRate;
                waveData[offset] = Math.round(waveData[offset]);
            }
        }

        console.log(maxTick, maxOffset, tickNotesMap, tickInstrumentMap, tickTempoMap, tickToOffset, offsetNotesMap, offsetInstrumentMap);
        
        // console.log(JSON.stringify(waveData.slice(50000, 100000)));

        // waveデータをriffに入れて新waveを作成 (Little Endian)
        for (let i = 0; i < waveData.length; i++) {
            const subOffset = 44 + i * 2;
            riffData[subOffset] = (!waveData[i]) ? 0 : waveData[i] & 0xFF
            riffData[subOffset+1] = (!waveData[i]) ? 0 : ((waveData[i] >> 8) & 0xFF);
        }
        const ret = new Uint8Array(riffData);
        setLittleEndianNumberToUint8Array(ret, 4, 4, waveData.length * 2 + 44);
        setLittleEndianNumberToUint8Array(ret, 40, 4, waveData.length * 2);
        
        return ret;
    }
}
