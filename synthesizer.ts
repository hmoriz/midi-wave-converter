import { DLS, MIDI } from "./chunk";
import { InstrumentData, ParseResult as DLSParseInfo } from './dls';
import { Filter } from "./filter";
import { ParseResult as MidiParseInfo } from "./midi";
import { Util } from "./util";

export namespace Synthesizer {
    // 44100Hz
    export const defaultByteRate = 44100;

    // art1Infoのtime Cents -> sec
    export function getSecondsFromArt1Scale(lScale: number) {
        if (lScale === -0x80000000) {
            return 0;
        }
        return 2 ** (lScale / 1200 / 65536);
    }

    // artInfoのpitch Cents -> Hz
    function getFrequencyFromArt1CentScale(lScale: number) {
        return 440 * (2 ** ((lScale / 65536 - 6900)/1200));
    }
    
    export class Art1Info {
        EG1AttackTime       : number = -2147483648; // Attack, DelayはTime cent単位で管理する
        EG1DecayTime        : number = -2147483648; // VelocityToAttack, KeyToDecay
        EG1ReservedTime     : number = 0; // cent -> sec に変換して管理
        EG1ReleaseTime      : number = 0; // cent -> secに変換
        EG1SustainLevel     : number = 100.0; // %単位 (0-100)
        EG1VelocityToAttack : number = -2147483648; // cent単位
        EG1KeyToDecay       : number = -2147483648; // cent単位
    
        EG2AttackTime       : number = -2147483648; // cent単位
        EG2DecayTime        : number = -2147483648; // cent単位
        EG2ReservedTime     : number = 0; // cent -> sec
        EG2ReleaseTime      : number = 0; // cent -> sec
        EG2SustainLevel     : number = 0.0; // %単位 (0-100)
        EG2VelocityToAttack : number = -2147483648; // cent単位
        EG2KeyToDecay       : number = -2147483648; // cent単位

        LFOFrequency : number = 5.0;
        LFOToVolume  : number = 0;
        LFOToPitch   : number = 0;
        LFODelay     : number = 0;

        EG2ToPitch : number = 0;

        Pan : number = 0;
        
        KeyNumberToPitch : number = -2147483648;

        PitchPerModWheel  : number = 0;
        VolumePerModWheel : number = 0;
    }
    
    const art1InfoCache = new Map<number, Art1Info>();
    // Lart Chunkから Art1に関するデータを取得する
    // 1度取得したものはart1InfoCacheに記録される(offset単位, 2度手間防止)
    export function getArt1InfoFromLarts(lart?: DLS.LartChunk) : Art1Info {
        const ret = new Art1Info();
        if (!lart || !lart.art1List) return ret;
        if (art1InfoCache.has(lart.offset)) {
            return art1InfoCache.get(lart.offset);
        }
        const art1s = lart.art1List;
        art1s.forEach(art1 => {
            // NOTE : 一部値はlScaleを10分の1にしているが根拠は"勘"以外特にない
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
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            if (cb.lScale !== -2147483648) {
                                ret.EG1AttackTime = cb.lScale;
                            }
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYONVELOCITY) {
                            ret.EG1VelocityToAttack = cb.lScale;
                            //console.log("EG1VelocityToAttack", cb.lScale, ret.EG1AttackTime);
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_DECAY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            if (cb.lScale !== -2147483648) {
                                ret.EG1DecayTime = cb.lScale;
                            }
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            ret.EG1KeyToDecay = cb.lScale;
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG1_RESERVED:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : おそらくここで定義されているのがSUSTAIN_LEVEL
                            ret.EG1SustainLevel = Math.max(0, Math.min(100.0, cb.lScale / 10));
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
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_ATTACK:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2AttackTime = cb.lScale;
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYONVELOCITY) {
                            ret.EG2VelocityToAttack = cb.lScale;
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_DECAY:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2DecayTime = cb.lScale;
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            ret.EG2KeyToDecay = cb.lScale;
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_EG2_RESERVED:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : おそらくここで定義されているのがSUSTAIN_LEVEL
                            ret.EG2SustainLevel = Math.max(0, Math.min(100.0, cb.lScale / 10));
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
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_DST_GAIN:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_LFO) {
                            // LFO -> Volume
                            if (cb.usControl === DLS.ART1CONTROL.CONN_CTRL_NONE) {
                                ret.LFOToVolume = cb.lScale / 655360;
                            } else if (cb.usControl === DLS.ART1CONTROL.CONN_CTRL_CC1) {
                                // (なさそう)
                                ret.VolumePerModWheel = cb.lScale / 655360;
                            }
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_CC7) {
                            // CC7(Volume Controller) -> Volume
                            // あったら対応(なさそう)
                            console.error("CC7ToVolume", cb.lScale);
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_CC11) {
                            // CC11(Expression Controller) -> Volume
                            // あったら対応(なさそう)
                            console.error("CC11ToVolume", cb.lScale);
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_DST_PITCH:
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_LFO) {
                            // LFO -> Pitch
                            if (cb.usControl === DLS.ART1CONTROL.CONN_CTRL_NONE) {
                                ret.LFOToPitch = Math.max(-1200, Math.min(1200, cb.lScale / 65536.0));
                                return;
                            } else if (cb.usControl === DLS.ART1CONTROL.CONN_CTRL_CC1) {
                                ret.PitchPerModWheel = Math.max(-1200, Math.min(1200, cb.lScale / 65536.0));
                                return;
                            }
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            // NOTE: DLS仕様書にはあるがgm.dlsにはなさそう
                            ret.KeyNumberToPitch = Math.max(-1200, Math.min(1200, cb.lScale / 65536.0 / 10));
                            return;
                        }
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_EG2) {
                            // EG2 Value to Pitch (max pitch delta)
                            ret.EG2ToPitch = Math.max(-1200, Math.min(1200, cb.lScale / 65536.0));
                            return;
                        }
                        break;
                    case DLS.ART1DESTINATION.CONN_DST_PAN:
                        // console.error("PAN", cb.lScale, cb.usSource, cb.lScale / 655360.0);
                        if (cb.usSource === DLS.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : 仕様書によれば0.1%単位らしいけど範囲に収めることを考えて65536 * 10で割る
                            ret.Pan = Math.max(-50, Math.min(50, cb.lScale / 655360.0));
                            return;
                        }
                }
                console.warn('Unknown ART1 Destination', cb);
            });
        });
        art1InfoCache.set(lart.offset, ret);
        return ret;
    }

    function getEG1AttackTimeFromArt1Info(art1Info : Art1Info, velocity : number) : number {
        let attackTime = 0;
        let attackTimeCent = -2147483648;
        if (art1Info.EG1AttackTime !== -2147483648) {
            attackTimeCent = art1Info.EG1AttackTime;
        }
        if (art1Info.EG1VelocityToAttack !== -2147483648) {
            attackTimeCent += art1Info.EG1VelocityToAttack * (velocity / 128);
        }
        if (attackTimeCent !== -2147483648) {
            attackTime = getSecondsFromArt1Scale(attackTimeCent);
        }
        return attackTime;
    }

    function getEG1DecayTimeFromArt1Info(art1Info : Art1Info, noteID : number) : number {
        let decayTime = 0;
        let decayTimeCent = -2147483648;
        if (art1Info.EG1DecayTime !== -2147483648) {
            decayTimeCent = art1Info.EG1DecayTime;
        }
        if (art1Info.EG1KeyToDecay !== -2147483648) {
            decayTimeCent += art1Info.EG1KeyToDecay * (noteID / 128);
        }
        if (decayTimeCent != -2147483648) {
            decayTime = getSecondsFromArt1Scale(decayTimeCent);
        }
        return decayTime;
    }

    function getEG2AttackTimeFromArt1Info(art1Info : Art1Info, velocity : number) : number {
        let attackTime = 0;
        let attackTimeCent = -2147483648;
        if (art1Info.EG2AttackTime !== -2147483648) {
            attackTimeCent = art1Info.EG2AttackTime;
        }
        if (art1Info.EG2VelocityToAttack !== -2147483648) {
            attackTimeCent += art1Info.EG2VelocityToAttack * (velocity / 128);
        }
        if (attackTimeCent !== -2147483648) {
            attackTime = getSecondsFromArt1Scale(attackTimeCent);
        }
        return attackTime;
    }

    function getEG2DecayTimeFromArt1Info(art1Info : Art1Info, noteID : number) : number {
        let decayTime = 0;
        let decayTimeCent = -2147483648;
        if (art1Info.EG2DecayTime !== -2147483648) {
            decayTimeCent = art1Info.EG2DecayTime;
        }
        if (art1Info.EG2KeyToDecay !== -2147483648) {
            decayTimeCent += art1Info.EG2KeyToDecay * (noteID / 128);
        }
        if (decayTimeCent != -2147483648) {
            decayTime = getSecondsFromArt1Scale(decayTimeCent);
        }
        return decayTime;
    }

    class NoteInfo {
        offset            : number;
        noteID            : number;
        velocity          : number;
        endTick           : number;
        endOffset         : number;
        releaseEndOffset  : number;   // リリース時間を考慮した完全に終了するオフセット
        length            : number;
        lengthWithRelease : number;
        notEnds           : boolean;  // 次のノートが開始されるまでオフが呼ばれなかったノートに対するフラグ
    }

    // チャンネルの楽器その他の情報
    class ChannelInfo {
        instrumentID : number = 0;
        bankID       : number = 0;
        volume       : number = 100;
        expression   : number = 127;
        pan          : number = undefined;
        modWheel     : number = 0;
        chorusLevel  : number = 0;
        reverbLevel  : number = 0;

        rpnLSB         : number = 127;
        rpnMSB         : number = 127;
        nRPNLSB        : number = 127;
        nRPNMSB        : number = 127;
        usingNrpn      : boolean = false;

        pitchBendSensitivity : number = 2;

        loopStartTick   : number = -1;
        loopLengthTick  : number = -1;

        constructor(data? : Partial<ChannelInfo>) {
            Object.assign(this, data);
        }
    }

    export class SynthesizeResult {
        waveSegment           : Uint8Array;
        waveSegmentWithEffect : Uint8Array;
        waveSegmentOnlyEffect : Uint8Array;
        channelToWaveSegment  : Map<number, Uint8Array>;
        channelToInstrument   : Map<number, DLS.InsChunk>;

        loopStartOffset : number = -1;
        loopLength      : number = -1;

        constructor() {
            this.channelToWaveSegment = new Map();
            this.channelToInstrument = new Map();
        }
    }

    export async function synthesizeMIDI(
                midi : MidiParseInfo,
                dls : DLSParseInfo,
                withEffect: boolean = true,
                outputChannel : boolean = true,
                loopAdjusting : boolean = false,
                byteRate : number = defaultByteRate,
                onProcessCallback : (text : string) => void = null
            ) :  Promise<SynthesizeResult> {

        // tick -> tempo change Info(number)
        const tickTempoMap = new Map<number, number>();
        // channel ID -> tick -> Instrument Info
        const tickInstrumentMap = new Map<number, Map<number, ChannelInfo>>();
        // channel ID -> tick
        const channelToInstrumentLastTick = new Map<number, number>();
        // channel ID -> tick -> [Note info]
        const tickNotesMap = new Map<number, Map<number, Array<NoteInfo>>>();
        // channel ID -> Note ID -> tick
        const channelToNoteLastTick = new Map<number, Map<number, Array<number>>>();
        // channel ID -> tick -> pitchBend Info (number)
        const tickPitchBendMap = new Map<number, Map<number, number>>();

        // 1. Truckを見てChannel -> tick -> 各種データを集める
        let maxTick = 0;
        midi.mtrks.forEach(mtrk => {
            let tick = 0;
            mtrk.Events.forEach(mtrkEvent => {
                tick += mtrkEvent.deltaTime;
                if (mtrkEvent.event instanceof MIDI.MIDIEvent) {
                    if (mtrkEvent.event.isNoteEvent) {
                        if (mtrkEvent.event.velocity > 0) {
                            // NOTE ON
                            const noteID = mtrkEvent.event.noteID;
                            const noteInfo = new NoteInfo();
                            noteInfo.noteID = noteID;
                            noteInfo.velocity = mtrkEvent.event.velocity;
                            if(!tickNotesMap.has(mtrkEvent.event.channel))tickNotesMap.set(mtrkEvent.event.channel, new Map());
                            if(!tickNotesMap.get(mtrkEvent.event.channel).has(tick)) {
                                tickNotesMap.get(mtrkEvent.event.channel).set(tick, new Array());
                            }
                            tickNotesMap.get(mtrkEvent.event.channel).get(tick).push(noteInfo);
                            if(!channelToNoteLastTick.has(mtrkEvent.event.channel))channelToNoteLastTick.set(mtrkEvent.event.channel, new Map());
                            if (channelToNoteLastTick.get(mtrkEvent.event.channel).has(noteInfo.noteID)) {
                                const lastTicks = channelToNoteLastTick.get(mtrkEvent.event.channel).get(noteID);
                                if (lastTicks.length > 0) {
                                    // 前回のONイベントがOFFにならずに残っているので一つ前のtickでオフにさせる(同一tickで同時にオンになっていた場合1つだけオフにする)
                                    const lastTick = lastTicks.pop();
                                    const noteInfo = tickNotesMap.get((mtrkEvent.event as MIDI.MIDIEvent).channel).get(lastTick).find(nInfo => noteID === nInfo.noteID && !nInfo.endTick);
                                    noteInfo.endTick = tick -1;
                                    noteInfo.notEnds = true;
                                }
                            } else {
                                channelToNoteLastTick.get(mtrkEvent.event.channel).set(noteInfo.noteID, []);
                            }
                            // 前回のONイベント追加(NoteID別)
                            channelToNoteLastTick.get(mtrkEvent.event.channel).get(noteInfo.noteID).push(tick);
                        } else {
                            // NOTE OFF
                            const noteID = mtrkEvent.event.noteID;
                            if (channelToNoteLastTick.has(mtrkEvent.event.channel)) {
                                if (channelToNoteLastTick.get(mtrkEvent.event.channel).has(noteID)) {
                                    const lastTicks = channelToNoteLastTick.get(mtrkEvent.event.channel).get(noteID);
                                    if (lastTicks.length > 0) {
                                        const lastTick = lastTicks.pop();
                                        const noteInfo = tickNotesMap.get((mtrkEvent.event as MIDI.MIDIEvent).channel).get(lastTick).find(nInfo => noteID === nInfo.noteID && !nInfo.endTick);
                                        noteInfo.endTick = tick;
                                    }
                                }
                            }
                        }
                    } else if (mtrkEvent.event.isControlEvent) {
                        const lastTick = channelToInstrumentLastTick.get(mtrkEvent.event.channel);
                        let channelInfo : ChannelInfo
                        if (channelToInstrumentLastTick.has(mtrkEvent.event.channel)) {
                            let lastInstrument = tickInstrumentMap.get(mtrkEvent.event.channel).get(lastTick);
                            channelInfo = new ChannelInfo(lastInstrument);
                        } else {
                            channelInfo = new ChannelInfo();
                        }
                        if (mtrkEvent.event.controlCommand === 0x00 || mtrkEvent.event.controlCommand === 0x20) {
                            // BANK Select (0x00 -> LSB, 0x20 -> MSB)
                            if (mtrkEvent.event.controlCommand === 0x20) {
                                // MSB
                                channelInfo.bankID = (channelInfo.bankID & 0xFF00) + mtrkEvent.event.value1;
                            } else {
                                // LSB
                                channelInfo.bankID = (channelInfo.bankID & 0x00FF) + (mtrkEvent.event.value1 << 8);
                            }
                        } else if (mtrkEvent.event.controlCommand === 1) {
                            // Modulation wheel
                            channelInfo.modWheel = mtrkEvent.event.value1;
                        } else if (mtrkEvent.event.controlCommand === 7) {
                            // Volume
                            channelInfo.volume = mtrkEvent.event.value1;
                        } else if (mtrkEvent.event.controlCommand === 10) {
                            // PAN
                            channelInfo.pan = mtrkEvent.event.value1;
                        } else if (mtrkEvent.event.controlCommand === 11) {
                            // Expression
                            channelInfo.expression = mtrkEvent.event.value1;
                        } else if (mtrkEvent.event.controlCommand === 6) {
                            // RPN Data Entry
                            if (channelInfo.usingNrpn) {
                                // NRPN
                                console.warn("not implemented NRPN", mtrkEvent.event.channel, channelInfo.nRPNMSB.toString(16), channelInfo.nRPNLSB.toString(16), mtrkEvent.event.value1);
                            } else {
                                // RPN
                                if (channelInfo.rpnMSB === 0 && channelInfo.rpnLSB === 0 ) {
                                    // Pitchbend Sensitivity
                                    channelInfo.pitchBendSensitivity = mtrkEvent.event.value1;
                                } else {
                                    console.warn("not inplemented RPN", mtrkEvent.event.channel, channelInfo.rpnMSB.toString(16), channelInfo.rpnLSB.toString(16));
                                }
                            }
                        } else if (mtrkEvent.event.controlCommand === 71) {
                            // filter resonance
                            if (mtrkEvent.event.value1 !== 64) {
                                console.warn("not implemented about filter!", mtrkEvent.event.value1);
                            }
                        } else if (mtrkEvent.event.controlCommand === 72) {
                            // Release Time
                            if (mtrkEvent.event.value1 !== 64) {
                                console.warn("not implemented about time cent!", mtrkEvent.event.value1);
                            }
                        } else if (mtrkEvent.event.controlCommand === 73) {
                            // Attack Time
                            if (mtrkEvent.event.value1 !== 64) {
                                console.warn("not implemented about filter!", mtrkEvent.event.value1);
                            }
                        } else if (mtrkEvent.event.controlCommand === 75) {
                            // Release Time
                            if (mtrkEvent.event.value1 !== 64) {
                                console.warn("not implemented about time cent!", mtrkEvent.event.value1);
                            }
                        } else if (mtrkEvent.event.controlCommand === 74) {
                            // Brightness
                            if (mtrkEvent.event.value1 !== 64) {
                                console.warn("not implemented about time cent!", mtrkEvent.event.value1);
                            }
                        } else if (mtrkEvent.event.controlCommand === 91) {
                            // Reverb (実装済み)
                            if (mtrkEvent.event.value1 !== 0) {
                                channelInfo.reverbLevel = mtrkEvent.event.value1;
                            }
                        } else if (mtrkEvent.event.controlCommand === 93) {
                            // Chorus (実装済み)
                            if (mtrkEvent.event.value1 !== 0) {
                                channelInfo.chorusLevel = mtrkEvent.event.value1;
                            }
                        } else if (mtrkEvent.event.controlCommand === 94) {
                            // Delay(GS) / Variety(XG)
                            if (midi.usingXG) {
                                if (mtrkEvent.event.value1 !== 0) {
                                    console.warn("not implemented Variable Effect", mtrkEvent.event.value1)
                                }
                            } else {
                                if (mtrkEvent.event.value1 !== 0) {
                                    console.warn("not implemented Delay", mtrkEvent.event.value1)
                                }

                            }
                        } else if (mtrkEvent.event.controlCommand === 98) {
                            // NRPN LSB
                            if (!midi.usingXG) {
                                console.error("This MIDI is not using XG!");
                            }
                            channelInfo.nRPNLSB = mtrkEvent.event.value1;
                            channelInfo.usingNrpn = true;
                        } else if (mtrkEvent.event.controlCommand === 99) {
                            // NRPN MSB
                            if (!midi.usingXG) {
                                console.error("This MIDI is not using XG!");
                            }
                            channelInfo.nRPNMSB = mtrkEvent.event.value1;
                            channelInfo.usingNrpn = true;
                        } else if (mtrkEvent.event.controlCommand === 100) {
                            // RPN LSB
                            channelInfo.rpnLSB = mtrkEvent.event.value1;
                            channelInfo.usingNrpn = false;
                        } else if (mtrkEvent.event.controlCommand === 101) {
                            // RPN MSB
                            channelInfo.rpnMSB = mtrkEvent.event.value1;
                            channelInfo.usingNrpn = false;
                        } else if (mtrkEvent.event.controlCommand === 111) {
                            if (channelInfo.loopStartTick <= 0) {
                                channelInfo.loopStartTick = tick;
                            } else {
                                channelInfo.loopLengthTick = tick - channelInfo.loopStartTick;
                            }
                        } else {
                            console.warn("not implemented Control Command", mtrkEvent.event.channel, mtrkEvent.event.controlCommand, mtrkEvent.event);
                        }
                        if (!tickInstrumentMap.get(mtrkEvent.event.channel)) tickInstrumentMap.set(mtrkEvent.event.channel, new Map());
                        tickInstrumentMap.get(mtrkEvent.event.channel).set(tick, channelInfo);
                        channelToInstrumentLastTick.set(mtrkEvent.event.channel, tick);
                    } else if (mtrkEvent.event.isProgramChangeEvent) {
                        // Program ID
                        const lastTick = channelToInstrumentLastTick.get(mtrkEvent.event.channel);
                        let channelInfo = new ChannelInfo();
                        if (channelToInstrumentLastTick.has(mtrkEvent.event.channel)) {
                            let lastInstrument = tickInstrumentMap.get(mtrkEvent.event.channel).get(lastTick);
                            channelInfo = new ChannelInfo(lastInstrument);
                        }
                        channelInfo.instrumentID = mtrkEvent.event.programID;
                        if (!tickInstrumentMap.has(mtrkEvent.event.channel)) tickInstrumentMap.set(mtrkEvent.event.channel, new Map());
                        tickInstrumentMap.get(mtrkEvent.event.channel).set(tick, channelInfo);
                        channelToInstrumentLastTick.set(mtrkEvent.event.channel, tick);
                    } else if (mtrkEvent.event.isPitchBendChangeEvent) {
                        if (!tickPitchBendMap.get(mtrkEvent.event.channel)) tickPitchBendMap.set(mtrkEvent.event.channel, new Map());
                        tickPitchBendMap.get(mtrkEvent.event.channel).set(tick, mtrkEvent.event.value1);
                    }
                } else if (mtrkEvent.event instanceof MIDI.SysExEvent) {
                    console.log("SysEx", mtrkEvent.event);
                } else if (mtrkEvent.event instanceof MIDI.MetaEvent) {
                    if (mtrkEvent.event.metaEventType === 0x51) {
                        // tempo event
                        const tempo = Util.getBigEndianNumberFromUint8Array(mtrkEvent.event.value, 0, mtrkEvent.event.value.length);
                        tickTempoMap.set(tick, tempo);
                    }
                } else {
                    throw new Error(JSON.stringify(mtrkEvent));
                }
            });
            maxTick = Math.max(maxTick, tick);
        });

        const channelIDs = new Set<number>();
        tickInstrumentMap.forEach((_, channelID) => channelIDs.add(channelID));
        tickNotesMap.forEach((_, channelID) => channelIDs.add(channelID));

        const notePerTick = midi.mthd.division; // ticks per 1/4 note (ex. 480)

        // 2. tick -> 各種情報を wave offset -> 各種情報に変換する

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
            offset += (1 / notePerTick) * (tempo / 1000000) * byteRate;
            // if (tempoEvent) console.log(tick, tempo, offset);
            tickToOffset.set(tick, offset);
            maxOffset = Math.max(maxOffset, offset);
        }

        // channel ID -> offset -> Instrument Info
        const offsetChannelInfoMap = new Map<number, Map<number, ChannelInfo>>();

        tickInstrumentMap.forEach((map, channelID) => {
            offsetChannelInfoMap.set(channelID, new Map());
            map.forEach((instrumentInfo, tick) => {
                const offset = Math.trunc(tickToOffset.get(tick));
                offsetChannelInfoMap.get(channelID).set(offset, instrumentInfo);
            });
        });

        // channel ID -> offset -> [Note info]
        const offsetNotesMap = new Map<number, Map<number, Array<NoteInfo>>>();

        tickNotesMap.forEach((map, channelID) => {
            offsetNotesMap.set(channelID, new Map());
            map.forEach((noteInfoArray, tick) => {
                noteInfoArray.forEach(noteInfo => {
                    const offset = Math.trunc(tickToOffset.get(tick));
                    noteInfo.offset = offset;
                    let endOffset : number;
                    if (noteInfo.endTick) {
                        endOffset = Math.trunc(tickToOffset.get(noteInfo.endTick));
                    } else {
                        endOffset = maxOffset;
                    }
                    noteInfo.endOffset = endOffset;
                    noteInfo.length = noteInfo.endOffset - offset;
                    if(!offsetNotesMap.get(channelID).get(offset))offsetNotesMap.get(channelID).set(offset, new Array());
                    offsetNotesMap.get(channelID).get(offset).push(noteInfo);
                })
            });
        });

        // channelID -> offset -> Pitch Info(number)
        const offsetPitchBendMap = new Map<number, Map<number, number>>();
        tickPitchBendMap.forEach((map, channelID) => {
            offsetPitchBendMap.set(channelID, new Map());
            map.forEach((pitchBendInfo, tick) => {
                const offset = Math.trunc(tickToOffset.get(tick));
                offsetPitchBendMap.get(channelID).set(offset, pitchBendInfo);
            });
        });

        // 3. 各チャンネルごとに全オフセット見て回り、 Wave用PCM作成(ここの割合が一番大きい)
        const waveDataR = new Array<number>(); // int16
        const waveDataL = new Array<number>(); // int16

        // enable only withEffect
        const waveDataWithEffectR = new Array<number>(); // int16
        const waveDataWithEffectL = new Array<number>(); // int16
        const waveDataOnlyEffectR = new Array<number>(); // int16
        const waveDataOnlyEffectL = new Array<number>(); // int16

        // channelID -> [waveDataR(Int16Array), waveDataL(Int16Array)]
        const channelWaveDatas = new Map<number, [Array<number>, Array<number>]>();

        // channelID -> Array[NoteInfo, sample_offset_speed_gain, last_sample_offset]
        const channelIDAttackingNoteMap = new Map<number, Array<[NoteInfo, InstrumentData, number, number]>>();
        // channelID -> [ChannelInfo, wave]
        const channelInfoMap = new Map<number, [ChannelInfo, InstrumentData]>();

        let loopStartOffset = -1;
        let loopLength = -1;
        let loopAdjustOffset = -1;
        // channelID -> [NoteInfo]
        const loopAnnoyingNoteMap = new Map<number, Array<NoteInfo>>();

        channelIDs.forEach(channelID => {
            channelIDAttackingNoteMap.set(channelID, new Array());
            channelWaveDatas.set(channelID, [new Array(), new Array()]);
            loopAnnoyingNoteMap.set(channelID, new Array());
        });
        // channelID -> pitchBend(number)
        const pitchBendMap = new Map<number, number>();
        let waveDataMaxMin = [1, -1];
        // channeiID -> [waveDataMin, waveDataMax]
        const channelWaveDataMaxMin = new Map<number, [number, number]>();

        // for Chorus
        const chorusDelay = Math.trunc(44100 * 15.0 / 1000); // 0.15s
        const waveDataBufferForChorusCapacity = chorusDelay + Math.ceil(20 / 3.2 * 44100 / 1000) + 1;
        const waveDataBufferForChorus : [Array<number>, Array<number>] = [
            new Array(), // R 16bit
            new Array(), // L 16bit
        ]; // NOTE: メモリを消費しすぎないようにする

        // for Reverb
        const reverber = new Filter.Reverber(byteRate);
        reverber.gain = 0.25; // そのままの設定だとリバーブが弱すぎるので強化しちゃう

        const processPartialMakeWaveSegment = (startOffset : number, endOffset : number) : Promise<void> => {
            return new Promise<void>((done) => {
                const processPartialMakeWaveSegment2 = (startOffset: number, endOffset : number) => {
                    console.log("Synthesize Processing...", startOffset, "-", endOffset, "/", Math.ceil(maxOffset));
                    onProcessCallback(`Synthesize Processing...${startOffset} / ${Math.ceil(maxOffset)}`);

                    const waveDataBufferForReverb : [number, number] = [0, 0]; // R L
                    for (let offset = startOffset; offset < Math.min(endOffset, Math.ceil(maxOffset)+ (loopAdjusting?(loopAdjustOffset-loopStartOffset):0)); offset++) {
                        waveDataR[offset] = 0;
                        waveDataL[offset] = 0;
                        const offsetForChorus = offset % waveDataBufferForChorusCapacity;
                        if (withEffect) {
                            waveDataWithEffectR[offset] = 0;
                            waveDataWithEffectL[offset] = 0;
                            waveDataOnlyEffectR[offset] = 0;
                            waveDataOnlyEffectL[offset] = 0;
                            waveDataBufferForChorus[0][offsetForChorus] = 0;
                            waveDataBufferForChorus[1][offsetForChorus] = 0;
                            waveDataBufferForReverb[0] = 0;
                            waveDataBufferForReverb[1] = 0;
                        }
            
                        let offsetForChannelData = offset;
                        if (!outputChannel) {
                            offsetForChannelData = offset % 256;
                        }

                        let tempLoopStart = -1;
                        let tempLoopLength = -1;
                        
                        channelIDs.forEach((channelID) => {
                            channelWaveDatas.get(channelID)[0][offsetForChannelData] = 0;
                            channelWaveDatas.get(channelID)[1][offsetForChannelData] = 0;
                            // if (channelID !== 0) return; // 仮置
                            let channelEvent = offsetChannelInfoMap.get(channelID)?.get(offset);
                            if (offset >= maxOffset && loopAdjusting) {
                                const adjustOffset = loopStartOffset + (offset - Math.ceil(maxOffset))-1;
                                channelEvent = offsetChannelInfoMap.get(channelID)?.get(adjustOffset);
                            }
                            const noteEvents = offsetNotesMap.get(channelID)?.get(offset) || new Array<NoteInfo>();
                            if (offset >= maxOffset && loopAdjusting) {
                                const adjustOffset = loopStartOffset + (offset - Math.ceil(maxOffset))-1;
                                const addingNoteEvents = offsetNotesMap.get(channelID)?.get(adjustOffset);
                                if (addingNoteEvents) {
                                    addingNoteEvents.forEach(noteEvent => {
                                        noteEvent.offset = offset;
                                        noteEvent.endOffset = offset + noteEvent.length;
                                    });
                                    noteEvents.push(...addingNoteEvents);
                                }
                            }
                        
                            if (channelEvent) {
                                if (noteEvents && noteEvents.length >= 1) {
                                    // 全く同タイミングでノート開始とチャンネル情報変更がはいっている場合、 ノート開始を先に実行させて次のオフセットでチャンネルを変更させる
                                    // とある楽曲で無効な楽器が参照されるのを回避するための応急処置
                                    offsetChannelInfoMap.get(channelID).set(offset+1, channelEvent);  
                                } else {
                                    /** @ts-ignore  */
                                    const bankID = channelID === 9 ? 2147483648 : channelEvent.bankID;
                                    let instrumentData : InstrumentData;
                                    if (dls.instrumentIDMap.get(channelEvent.instrumentID).has(bankID)) {
                                        instrumentData = dls.instrumentIDMap.get(channelEvent.instrumentID)?.get(bankID);
                                    } else {
                                        // bankIDの音が不在なので0で代用する
                                        // TODO : GS, XG音源対策
                                        /** @ts-ignore  */
                                        if (channelID !== 9) {
                                            instrumentData = dls.instrumentIDMap.get(channelEvent.instrumentID)?.get(0);
                                            console.warn(`channel ${channelID}: instrument ${channelEvent.instrumentID}'s bank ${bankID} is not found, using 0`);
                                        } else {
                                            instrumentData = dls.instrumentIDMap.get(0)?.get(2147483648);
                                            console.warn(`channel ${channelID}: Rhythm instrument ${channelEvent.instrumentID} is not found, using 0`, instrumentData);
                                        }
                                    }
                                    channelInfoMap.set(channelID, [channelEvent, instrumentData]);
                                    if (offset < Math.ceil(maxOffset)-1 && channelEvent.loopStartTick >= 0) {
                                        tempLoopStart = Math.round(tickToOffset.get(channelEvent.loopStartTick));
                                        console.log(channelID, channelEvent.loopStartTick, tempLoopStart);
                                    }
                                    if (offset < Math.ceil(maxOffset)-1 && channelEvent.loopLengthTick >= 0) {
                                        tempLoopLength = Math.round(tickToOffset.get(channelEvent.loopLengthTick));
                                    }
                                }
                            }
                            if (noteEvents && noteEvents.length >= 1) {
                                const instrumentData = channelInfoMap.get(channelID)?.[1];
                                noteEvents.forEach(noteEvent => {
                                    channelIDAttackingNoteMap.get(channelID).push([noteEvent, instrumentData, 0, 0]);
                                })
                            }

                            let pitchBendEventMap = offsetPitchBendMap.get(channelID);
                            if (pitchBendEventMap && pitchBendEventMap.has(offset)) {
                                const pitchBendEvent =  pitchBendEventMap.get(offset);
                                pitchBendMap.set(channelID, pitchBendEvent);
                            } else if (pitchBendEventMap && offset >= maxOffset && loopAdjusting) {
                                const adjustOffset = loopStartOffset + (offset - Math.ceil(maxOffset))-1;
                                if (pitchBendEventMap.has(adjustOffset)) {
                                    const pitchBendEvent =  pitchBendEventMap.get(adjustOffset);
                                    pitchBendMap.set(channelID, pitchBendEvent);
                                }
                            }
                            // 現在Onになっているノートに対してサンプルを収集しwaveDataに格納してく
                            let attackingNotes = channelIDAttackingNoteMap.get(channelID);
                            if (attackingNotes.length >= 1) {
                                const channelData = channelInfoMap.get(channelID);
                                let channelInfo : ChannelInfo;
                                if (channelData) {
                                    [channelInfo] = channelInfoMap.get(channelID);
                                }
                                attackingNotes.forEach((attackingNoteData, arrayIndex) => {
                                    if (!channelData) return;
                                    if (!attackingNoteData) return;
                                    const [noteInfo, instrumentData, sampleOffsetSpeedGain, lastSampleOffset] = attackingNoteData;
                                    const attackedOffset = noteInfo.offset;
                                    const noteID = noteInfo.noteID;
                                    const position = offset - attackedOffset;
                                    const positionFromReleased = offset - noteInfo.endOffset;
                                    const sec = position / byteRate;
                                    const secFromReleased = positionFromReleased / byteRate;
                                    const rgn = instrumentData.insChunk.lrgn.rgnList.find(rgn => {
                                        return rgn.rgnh.rangeKey.usLow <= noteID && 
                                            noteID <= rgn.rgnh.rangeKey.usHigh &&
                                            rgn.rgnh.rangeVelocity.usLow <= noteInfo.velocity &&
                                            noteInfo.velocity <=  rgn.rgnh.rangeVelocity.usHigh;
                                    });
                                    if (!rgn) {
                                        // rgnが存在しないなどないはず
                                        console.error("not defined RGN", noteID, noteInfo.velocity, instrumentData.insChunk.lrgn.rgnList);
                                        attackingNotes[arrayIndex] = null;
                                        return;
                                    }
                                    let art1Info : Art1Info;
                                    if (instrumentData.insChunk.lart) {
                                        art1Info = getArt1InfoFromLarts(instrumentData.insChunk.lart);
                                    }
                                    if (!instrumentData.insChunk.lart && rgn.lart) {
                                        // ins直属のlartが存在しない -> regionごとのlartのほうを取得(with cache)
                                        art1Info = getArt1InfoFromLarts(rgn.lart);
                                    } else if (!instrumentData.insChunk.lart && !rgn.lart) {
                                        // TODO: 一応このケースも想定する必要あり(gm.dlsにはない)
                                        console.error("no ins lart nor rgn lart", channelInfo.instrumentID, rgn);
                                        return;
                                    }
                                    if (secFromReleased >= art1Info.EG1ReleaseTime) {
                                        // ノートオフ かつリリース時間を超えているので配列から雑に削除
                                        attackingNotes[arrayIndex] = null;
                                        return;
                                    } else {
                                        const waveChunk = instrumentData.waves.get(rgn.wlnk.ulTableIndex);
                                        if (!waveChunk) {
                                            // 音源が不在(普通はないはず)
                                            console.error("cannot load waveInfo from ", rgn);
                                            attackingNotes[arrayIndex] = null;
                                            return;
                                        }
                                        const bps = waveChunk.bytesPerSecond;
                                        const sampleOffsetDefaultSpeed = bps / byteRate;
                                        const wsmp = rgn.wsmp || waveChunk.wsmpChunk;
                                        let baseFrequency = 0;
                                        let waveLoopStart = 0;
                                        let waveLoopLength = 0;
                                        let waveLooping = false;
                                        let freqRate = 1;
                                        if (wsmp) {
                                            const unityNote = wsmp.usUnityNote;
                                            baseFrequency = Util.getFrequencyFromNoteID(unityNote);
                                            const altFreq = Util.getFrequencyFromNoteID(noteID);
                                            freqRate = altFreq / baseFrequency;
                                            if (wsmp.waveSampleLoop) {
                                                waveLooping = true;
                                                waveLoopStart = wsmp.waveSampleLoop.ulLoopStart;
                                                waveLoopLength = wsmp.waveSampleLoop.ulLoopLength;
                                            }
                                        }
                                        // EG2(Envelope Generator for Pitch)情報をpositionDXに雑に適用
                                        let nextSampleOffsetSpeedGain = sampleOffsetSpeedGain;
                                        if (position >= 1 && art1Info) {
                                            let sampleOffsetSpeedCents = 0;
                                            let eg2PitchCents = 0;
                                            if (art1Info.EG2ToPitch !== 0) {
                                                const attackTime = getEG2AttackTimeFromArt1Info(art1Info, noteInfo.velocity);
                                                const decayTime = getEG2DecayTimeFromArt1Info(art1Info, noteInfo.noteID);
                                                if (sec < attackTime) {
                                                    // Attack Zone
                                                    if (sec === 0) {
                                                        eg2PitchCents = 0
                                                    } else {
                                                        eg2PitchCents = art1Info.EG2ToPitch * sec / attackTime;
                                                    }
                                                } else if (positionFromReleased <= 0) {
                                                    // Decay or Sustain Zone
                                                    if (sec === 0 || art1Info.EG2DecayTime === 0) {
                                                        eg2PitchCents = 0;
                                                    } else {
                                                        if (sec === attackTime) {
                                                            eg2PitchCents = art1Info.EG2ToPitch;
                                                        } else {
                                                            eg2PitchCents = art1Info.EG2ToPitch - art1Info.EG2ToPitch * Math.min(1, (sec - attackTime) / decayTime);
                                                        }
                                                    }
                                                    eg2PitchCents = art1Info.EG2ToPitch > 0 ? 
                                                        Math.max(eg2PitchCents, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0) : 
                                                        Math.min(eg2PitchCents, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0);
                                                } else {
                                                    // Sustain or Release Zone
                                                    let dddx = art1Info.EG2ToPitch;
                                                    if (sec === 0 || art1Info.EG2DecayTime === 0) {
                                                        dddx = 0;
                                                    } else {
                                                        if (sec !== attackTime) {
                                                            dddx = art1Info.EG2ToPitch -  art1Info.EG2ToPitch * Math.min(1, (sec - attackTime) / decayTime);
                                                        }
                                                    }
                                                    dddx = art1Info.EG2ToPitch > 0 ? 
                                                        Math.max(dddx, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0) :
                                                        Math.min(dddx, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0);
                                                    if (art1Info.EG2ReleaseTime === 0) {
                                                        eg2PitchCents = 0;
                                                    } else {
                                                        if (noteInfo.endOffset === offset) {
                                                            eg2PitchCents = dddx;
                                                        } else {
                                                            eg2PitchCents = art1Info.EG2ToPitch - art1Info.EG2ToPitch * Math.min(1, secFromReleased / (art1Info.EG2ReleaseTime));
                                                        }
                                                    }
                                                    eg2PitchCents = art1Info.EG2ToPitch > 0 ? 
                                                        Math.min(eg2PitchCents, dddx) : 
                                                        Math.max(eg2PitchCents, dddx);
                                                }
                                                // eg2PitchCents : cent単位
                                                eg2PitchCents = Math.max(-1200, Math.min(1200, eg2PitchCents));
                                            }
                                            sampleOffsetSpeedCents += eg2PitchCents;
                                            // LFO情報もpositionDXに適用 (cent単位)
                                            let lfoPitchCents = 0;
                                            if ((channelInfo && channelInfo.modWheel > 0) || art1Info.LFOToPitch !== 0) {
                                                // 遅延が存在する場合は遅延時間以降でサインカーブを生成
                                                // また, -50～50(DLSに設定が存在する場合は別)centでmodulationWheelを適用
                                                lfoPitchCents = Math.sin(Math.max(0, sec - art1Info.LFODelay) * Math.PI * 2 * art1Info.LFOFrequency) * (art1Info.LFOToPitch + (art1Info.PitchPerModWheel || 50) * (channelInfo.modWheel / 127));
                                                // if (channelInfo.modWheel > 0) console.log(channelID, offset, sec, art1Info.LFODelay, channelInfo.modWheel, lfo, art1Info.LFOToPitch, art1Info.PitchPerModWheel);
                                            }
                                            sampleOffsetSpeedCents += lfoPitchCents;
                                            if (wsmp) {
                                                // sFineTune を加味 (NOTE : DLSの仕様では65536で割るべきっぽいけどgm.dlsのfineTuneの内容的に行わない)
                                                sampleOffsetSpeedCents += wsmp.sFineTune;
                                            }
                                            // ピッチベンド Cent値適用 (-8192～8191の範囲で存在し, 最大6分の1オクターブ程度変更させる)
                                            let pitchBendCents = 0;
                                            if (pitchBendMap.has(channelID)) {
                                                const pitchBend = pitchBendMap.get(channelID);
                                                pitchBendCents = pitchBend / 8192 * 1200 / 12 * (channelInfo?.pitchBendSensitivity || 2);
                                            }
                                            sampleOffsetSpeedCents += pitchBendCents;
                                            // sampleOffsetSpeedGain : 増加率 (cent = 1200分の1オクターブとして計算)
                                            nextSampleOffsetSpeedGain = (2 ** (sampleOffsetSpeedCents / 1200));
                                            // if (sec > 2.0) console.log(offset, channelID, position, sec, pitchBendMap.get(channelID), lastSampleOffset, sampleOffsetSpeedGain, nextSampleOffsetSpeedGain, sampleOffsetSpeedCents, sampleOffsetDefaultSpeed, freqRate, wsmp?.sFineTune, lfoPitchCents, eg2PitchCents, art1Info);
                                        }
                                        // サンプル側の取得するべきオフセットを取得(ピッチによる変動を考慮済み)
                                        let sampleOffset = Math.max(0, (lastSampleOffset + sampleOffsetDefaultSpeed * freqRate * nextSampleOffsetSpeedGain));
                                        // speedとOffset更新
                                        channelIDAttackingNoteMap.get(channelID)[arrayIndex] = [noteInfo, instrumentData, nextSampleOffsetSpeedGain, sampleOffset];
                                        
                                        // サンプルwaveのループ部分
                                        if (waveLooping && sampleOffset >= (waveLoopStart + waveLoopLength)) {
                                            sampleOffset = ((sampleOffset - (waveLoopStart + waveLoopLength)) % waveLoopLength) + waveLoopStart;
                                        } else if (!waveLooping && sampleOffset >= waveChunk.pcmData.length-1) {
                                            // if (offset <= noteInfo.endOffset) {
                                                // NOTE ONのうちにワンショット系の時間が過ぎているので一応警告
                                                // console.warn("sampleOffset is out of BOUND", sampleOffset );
                                            // }
                                            attackingNotes[arrayIndex] = null;
                                            return;
                                        }
                                        // TODO : 一旦「線形補間」
                                        let sampleWaveData = 0;
                                        if (Number.isInteger(sampleOffset)) {
                                            sampleWaveData = waveChunk.pcmData[sampleOffset];
                                        } else {
                                            const x1 = Math.trunc(sampleOffset);
                                            const x2 = Math.ceil(sampleOffset);
                                            const y1 = waveChunk.pcmData[x1];
                                            const y2 = waveChunk.pcmData[x2];
                                            sampleWaveData = (x2 - sampleOffset) * y1 + (sampleOffset - x1) * y2;
                                        }
                                        // EG1(Envelope Generator for Volume)情報を反映
                                        // NOTE : AttenuationはdB単位で取得し最後に雑に指数関数的に減衰させる
                                        let eg1Attenuation = 96;
                                        if (art1Info) {
                                            const attackTime = getEG1AttackTimeFromArt1Info(art1Info, noteInfo.velocity);
                                            const decayTime = getEG1DecayTimeFromArt1Info(art1Info, noteInfo.noteID);
                                            if (sec < attackTime) {
                                                // Attack Zone
                                                eg1Attenuation = Math.min(96, sec === 0 ? 96 : 20 * Math.log10(attackTime / sec));
                                            } else if (positionFromReleased <= 0) {
                                                // Decay or Sustain Zone
                                                if (sec === 0 || decayTime === 0) {
                                                    eg1Attenuation = 96;
                                                } else {
                                                    if (sec === attackTime) {
                                                        eg1Attenuation = 0;
                                                    } else {
                                                        eg1Attenuation = 96 * (sec - attackTime) / decayTime;
                                                    }
                                                }
                                                eg1Attenuation = Math.min(eg1Attenuation, 96 * (1 - art1Info.EG1SustainLevel / 100.0));
                                            } else {
                                                // Sustain or Release Zone
                                                let dAttenuation = 96;
                                                if (sec === 0 || decayTime === 0) {
                                                    dAttenuation = 96;
                                                } else {
                                                    if (sec === attackTime) {
                                                        dAttenuation = 0;
                                                    } else {
                                                        dAttenuation = 96 * (sec - attackTime) / decayTime;
                                                    }
                                                }
                                                dAttenuation = Math.min(dAttenuation, 96 * (1 - art1Info.EG1SustainLevel / 100.0));
                                                if (art1Info.EG1ReleaseTime === 0) {
                                                    eg1Attenuation = 96;
                                                } else {
                                                    if (offset === noteInfo.endOffset) {
                                                        eg1Attenuation = dAttenuation;
                                                    } else {
                                                        eg1Attenuation = 96 * secFromReleased / art1Info.EG1ReleaseTime;
                                                    }
                                                }
                                                if (noteInfo.notEnds) {
                                                    // 次のノートが迫っているパターンのため, Attenuationを加速させる
                                                    eg1Attenuation *= 2;
                                                }
                                                eg1Attenuation = Math.max(eg1Attenuation, dAttenuation);
                                            }
                                            eg1Attenuation = Math.min(96, Math.max(0, eg1Attenuation));
                                            // if (positionFromReleased === -1 || positionFromReleased === 0 || positionFromReleased === 1) console.log(offset, channelID, noteID, noteInfo.endOffset, noteInfo.length, position, sec, secFromReleased, sec <= attackTime, positionFromReleased <= 0, eg1Velocity, eg1Attenuation, dAttenuation, attackTime, art1Info.EG1AttackTime, art1Info.EG1VelocityToAttack);
                                        }
                                        // LFO情報を反映
                                        let lfo = 0;
                                        let lfoAttenuation = 0;
                                        if (art1Info) {
                                            if (art1Info.LFOToVolume != 0) {
                                                // 遅延が存在する場合は遅延時間以降でサインカーブを生成
                                                if (sec >= art1Info.LFODelay) {
                                                    lfo = Math.sin(Math.max(0, sec - art1Info.LFODelay) * Math.PI * 2 * art1Info.LFOFrequency) * art1Info.LFOToVolume;
                                                    lfoAttenuation = lfo;
                                                }
                                            }
                                        }
                                        // WSMPのAttenuation考慮(NOTE: dB値を減衰ではなく増加させる方向で)
                                        let wsmpAttenuation = 0;
                                        if (wsmp) {
                                            if (wsmpAttenuation === 0x80000000) {
                                                sampleWaveData = 0;
                                            }
                                            wsmpAttenuation = -wsmp.lAttenuation / 655360;
                                        }
                                        let sampleWaveDataR = sampleWaveData;
                                        let sampleWaveDataL = sampleWaveData;
                                        // Velocity Attenuation
                                        let velocityAttenuation = Math.min(96, 20 * Math.log10((127 ** 2) / (noteInfo.velocity ** 2)));
                                        // Volume Attenuation
                                        let volumeAttenuation = 0;
                                        if (channelInfo) {
                                            volumeAttenuation = Math.min(96, 20 * Math.log10((127 ** 2) / (channelInfo.volume ** 2)));
                                        }
                                        // Expression Attenuation
                                        let expressionAttenuation = 0;
                                        if (channelInfo) {
                                            expressionAttenuation = Math.min(96, 20 * Math.log10((127 ** 2) / (channelInfo.expression ** 2)));
                                        }
                                        // PAN考慮
                                        let panAttenuationR = 0;
                                        let panAttenuationL = 0;
                                        if (channelInfo.pan !== undefined) {
                                            const pan = channelInfo.pan;
                                            panAttenuationR = -Math.min(96, 20 * Math.log10(Math.cos(Math.PI / 2 * pan / 127)));
                                            panAttenuationL = -Math.min(96, 20 * Math.log10(Math.sin(Math.PI / 2 * pan / 127)));
                                        } else if (art1Info.Pan !== 0) {
                                            const pan = 64 - art1Info.Pan / 50 * 64;
                                            panAttenuationR = -Math.min(96, 20 * Math.log10(Math.cos(Math.PI / 2 * pan / 127)));
                                            panAttenuationL = -Math.min(96, 20 * Math.log10(Math.sin(Math.PI / 2 * pan / 127)));
                                        }
                                        // if (offset % 1000000 === 1) console.log(offset, channelID, eg1Attenuation, lfoAttenuation, wsmpAttenuation, wsmpAttenuation, 127 - 10 ** ((wsmpAttenuation*40 + lfoAttenuation)), 20 * Math.log10((127**2)-(eg1Attenuation**2)), 0.1 ** ((eg1Attenuation + lfoAttenuation + wsmpAttenuation) / 20));
                                        // if (offset % 1000000 === 0) console.log(offset, channelID, art1Info.LFOFrequency, art1Info.LFOToVolume, art1Info.LFOToPitch, art1Info.LFODelay, lfo);
                                        sampleWaveDataR = (sampleWaveData * (0.1 ** ((Math.max(0, eg1Attenuation + velocityAttenuation + wsmpAttenuation + lfoAttenuation + volumeAttenuation + expressionAttenuation + panAttenuationR)) / 20)));
                                        sampleWaveDataL = (sampleWaveData * (0.1 ** ((Math.max(0, eg1Attenuation + velocityAttenuation +  wsmpAttenuation + lfoAttenuation + volumeAttenuation + expressionAttenuation + panAttenuationL)) / 20)));
                                        if (isNaN(sampleWaveData)) {
                                            console.error(channelID, offset, lfo, sampleOffset, sampleWaveData, art1Info.EG1ReleaseTime, channelInfo.volume);
                                        }
                                        waveDataR[offset] += sampleWaveDataR;
                                        waveDataL[offset] += sampleWaveDataL;
                                        waveDataWithEffectR[offset] += sampleWaveDataR;
                                        waveDataWithEffectL[offset] += sampleWaveDataL;

                                        channelWaveDatas.get(channelID)[0][offsetForChannelData] += sampleWaveDataR;
                                        channelWaveDatas.get(channelID)[1][offsetForChannelData] += sampleWaveDataL;
                                        // console.log(offset, attackedOffset, noteInfo, positionDX, art1Info, wsmp, position, sampleOffset, freqRate, sampleWaveData, eg1Velocity, waveLoopLength, waveLoopStart, waveInfo.wave.pcmData.length);
                                        if (sec >= 1 && eg1Attenuation + velocityAttenuation + wsmpAttenuation + lfoAttenuation + volumeAttenuation + expressionAttenuation >= 96) {
                                            // なり始めてから時間がそれなりに経ち音量が下がりきってる -> 配列から除去(計算の対象外とする)
                                            attackingNotes[arrayIndex] = null;
                                        }
                                    }
                                });

                                // 消えたデータを除去
                                channelIDAttackingNoteMap.set(channelID, attackingNotes.filter(data => !!data));

                                // コーラス集計
                                if (withEffect && channelInfo && channelInfo.chorusLevel > 0) {
                                    waveDataBufferForChorus[0][offsetForChorus] += channelWaveDatas.get(channelID)[0][offsetForChannelData] * (channelInfo.chorusLevel / 127);
                                    waveDataBufferForChorus[1][offsetForChorus] += channelWaveDatas.get(channelID)[1][offsetForChannelData] * (channelInfo.chorusLevel / 127);
                                }
                                // リバーブ集計
                                if (withEffect && channelInfo && channelInfo.reverbLevel > 0) {
                                    waveDataBufferForReverb[0] += channelWaveDatas.get(channelID)[0][offsetForChannelData] * (channelInfo.reverbLevel / 127);
                                    waveDataBufferForReverb[1] += channelWaveDatas.get(channelID)[1][offsetForChannelData] * (channelInfo.reverbLevel / 127);
                                }

                                if (!channelWaveDataMaxMin.has(channelID)) {
                                    channelWaveDataMaxMin.set(channelID, [
                                        channelWaveDatas.get(channelID)[0][offsetForChannelData] || 1, 
                                        channelWaveDatas.get(channelID)[0][offsetForChannelData] || -1
                                    ]);
                                } else {
                                    const [max, min] = channelWaveDataMaxMin.get(channelID);
                                    channelWaveDataMaxMin.set(channelID, [
                                        Math.max(max, channelWaveDatas.get(channelID)[0][offsetForChannelData] || 1, channelWaveDatas.get(channelID)[1][offset] || 1), 
                                        Math.min(min, channelWaveDatas.get(channelID)[0][offsetForChannelData] || -1, channelWaveDatas.get(channelID)[1][offset] || -1)
                                    ]);
                                }
                            }
                        });

                        // ループ開始位置獲得・修正開始
                        if (tempLoopStart >= 0) {
                            loopStartOffset = tempLoopStart;
                            if (loopStartOffset >= loopAdjustOffset) {
                                loopAdjustOffset = loopStartOffset;
                            }
                        }
                        if (loopAdjusting && tempLoopStart >= 0 && Math.abs(offset-loopStartOffset) <= 1) {
                            console.log(tempLoopStart, offset, loopStartOffset, Math.abs(offset-loopStartOffset));
                            channelIDs.forEach((channelID) => {
                                // 現在再生中のNoteを記録し、 その音が消えるまでループ位置ををずらす
                                channelIDAttackingNoteMap.get(channelID).forEach(attackingNoteData => {
                                    loopAnnoyingNoteMap.get(channelID).push(attackingNoteData[0]);
                                });
                                // 現在のチャンネル情報を末尾に追加
                                const currentChannelInfos = channelInfoMap.get(channelID);
                                if (currentChannelInfos && currentChannelInfos[0]) {
                                    offsetChannelInfoMap.get(channelID).set(Math.ceil(maxOffset)-1, currentChannelInfos[0]);
                                }
                            });
                            console.log("adjusting loop", offset, loopStartOffset, loopAnnoyingNoteMap);
                        }
                        // ループ修正処理中・終了処理
                        if (loopAdjusting && loopStartOffset >= 0 && loopStartOffset <= offset && loopAdjustOffset === loopStartOffset) {
                            let num = 0;
                            channelIDs.forEach((channelID) => {
                                const attackingNotes = channelIDAttackingNoteMap.get(channelID);
                                const annoyingNotes = loopAnnoyingNoteMap.get(channelID);
                                loopAnnoyingNoteMap.set(channelID, annoyingNotes.filter(note => attackingNotes.findIndex((data) => data[0] === note) >= 0));
                                num += loopAnnoyingNoteMap.get(channelID).length;
                            });
                            if (num === 0) {
                                loopAdjustOffset = offset;
                                console.log('adjusted offset', offset, loopStartOffset);
                            }
                        }
                        // ループ長さ獲得
                        if (tempLoopLength >= 0) {
                            loopLength = tempLoopLength;
                        }

                        // 此処から先はエフェクト処理
                        if (withEffect) {
                            // コーラス適用
                            let delayOffsetForChorus = offsetForChorus - chorusDelay;
                            delayOffsetForChorus -= (1+Math.sin(offset / byteRate * 2 * Math.PI * (3 * 0.122))) * (20 / 3.2 * byteRate / 1000) / 2;
                            const deltaForChorus = delayOffsetForChorus - Math.floor(delayOffsetForChorus);
                            delayOffsetForChorus = Math.round(delayOffsetForChorus - deltaForChorus);
                            while (delayOffsetForChorus < 0) {
                                delayOffsetForChorus = delayOffsetForChorus + waveDataBufferForChorusCapacity;
                            }
                            let delayOffsetForChorus1 = (delayOffsetForChorus+1) % waveDataBufferForChorusCapacity;
    
                            const chorusDataR = (1-deltaForChorus) * (waveDataBufferForChorus[0][delayOffsetForChorus] || 0) + 
                                deltaForChorus * (waveDataBufferForChorus[0][delayOffsetForChorus1] || 0);
                            waveDataBufferForChorus[0][offsetForChorus] += chorusDataR * (8 * 0.763 * 0.01);
                            waveDataWithEffectR[offset] += chorusDataR;
                            waveDataOnlyEffectR[offset] += chorusDataR;
    
                            const chorusDataL = (1-deltaForChorus) * (waveDataBufferForChorus[1][delayOffsetForChorus] || 0) + 
                                deltaForChorus * (waveDataBufferForChorus[1][delayOffsetForChorus1] || 0);
                            waveDataBufferForChorus[1][offsetForChorus] += chorusDataL * (8 * 0.763 * 0.01);
                            waveDataWithEffectL[offset] += chorusDataL;
                            waveDataOnlyEffectL[offset] += chorusDataL;
    
                            // for debug
                            // if (offset % 10000 <= 10) {
                            //     console.log(offset, offsetForChorus, deltaForChorus, delayOffsetForChorus, delayOffsetForChorus1, waveDataR[offset],
                            //         chorusDataR, chorusDataL,
                            //         waveDataBufferForChorus[0][offsetForChorus], waveDataWithEffectR[offset]);
                            //     //console.log(offset, waveDataBufferForChorus[0][offsetForChorus], waveDataBufferForChorus[0][delayOffsetForChorus], waveDataBufferForChorus[0][delayOffsetForChorus1], offsetForChorus, delayOffsetForChorus, delayOffsetForChorus1, waveDataWithEffectR[offset], waveDataWithEffectL[offset]);
                            // }
    
                            // リバーブ適用
                            // 入力→出力の関係性はClassが全部請け負ってるのでそれを拾うのみ
                            const [reverbOutputR, reverbOutputL] = reverber.update(waveDataBufferForReverb[0], waveDataBufferForReverb[1]);
                            waveDataWithEffectR[offset] += reverbOutputR;
                            waveDataOnlyEffectR[offset] += reverbOutputR;
                            waveDataWithEffectL[offset] += reverbOutputL;
                            waveDataOnlyEffectL[offset] += reverbOutputL;
                            
                            // // for debug
                            // if (offset % 10000 <= 10) {
                            //     console.log(offset, waveDataBufferForReverb, reverbOutputR, reverbOutputL, reverbOutputR / waveDataBufferForReverb[0], reverber);
                            //     // console.log(JSON.stringify(waveDataBufferForReverbB[0]));
                            //     // console.log(JSON.stringify(waveDataBufferForReverbB[1]));
                            // }
                        }

                        // 最大値・最小値を集計(音割れ防止の為の対応を後でやるため, 最後にMath.maxは引数がパンクするため)
                        if (waveDataR[offset]) {
                            waveDataMaxMin[0] = Math.max(waveDataMaxMin[0], waveDataR[offset], waveDataL[offset], waveDataWithEffectR[offset], waveDataWithEffectL[offset]);
                            waveDataMaxMin[1] = Math.min(waveDataMaxMin[1], waveDataR[offset], waveDataL[offset], waveDataWithEffectR[offset], waveDataWithEffectL[offset]);
                        }
                    }
                    // NOTE : かなり雑なループなため, バグるかも
                    if (endOffset < Math.ceil(maxOffset)) {
                        setTimeout(() => {
                            processPartialMakeWaveSegment2(endOffset,Math.min(endOffset+(endOffset-startOffset), Math.ceil(maxOffset)));
                        }, 10);
                    } else {
                        if (loopLength < 0) {
                            loopLength = Math.ceil(maxOffset) - loopStartOffset;
                        }
                        if (loopAdjusting && endOffset === Math.ceil(maxOffset) && loopAdjustOffset > loopStartOffset) {
                            setTimeout(() => {
                                processPartialMakeWaveSegment2(Math.ceil(maxOffset), Math.ceil(maxOffset) + loopAdjustOffset-loopStartOffset);
                            }, 10);
                            return;
                        }
                        console.log("processPartialMakeWaveSegment done!");
                        done();
                    }
                };
                processPartialMakeWaveSegment2(startOffset, endOffset);
            });
        };

        let allendCallback = () : Promise<SynthesizeResult> => {
            console.log("allendCallback");
            return new Promise<SynthesizeResult>((done) => {
                // -32768~32767に範囲をおさえる(音割れ防止)
                const correctRate = Math.min(32767 / waveDataMaxMin[0], -32768 / waveDataMaxMin[1]);
                //console.log(waveDataRMax, waveDataRMin, correctRate);
                if (correctRate < 1) {
                    for (let offset = 0; offset < maxOffset+(loopAdjusting?(loopAdjustOffset-loopStartOffset):0); offset++) {
                        waveDataR[offset] = Math.round(waveDataR[offset] *  correctRate * 0.99);
                        waveDataL[offset] = Math.round(waveDataL[offset] *  correctRate * 0.99);
                        waveDataWithEffectR[offset] = Math.round(waveDataWithEffectR[offset] *  correctRate * 0.99);
                        waveDataWithEffectL[offset] = Math.round(waveDataWithEffectL[offset] *  correctRate * 0.99);
                        waveDataOnlyEffectR[offset] = Math.round(waveDataOnlyEffectR[offset] *  correctRate * 0.99);
                        waveDataOnlyEffectL[offset] = Math.round(waveDataOnlyEffectL[offset] *  correctRate * 0.99);
                    }
                }

                console.log(maxTick, maxOffset, correctRate, tickNotesMap, tickInstrumentMap, tickTempoMap, tickToOffset, offsetNotesMap, offsetChannelInfoMap);
                
                // console.log(JSON.stringify(waveData.slice(50000, 100000)));

                // 4. Uint16Array -> Uint8Array に変換して Waveのヘッダを載せて完成
                const result = new SynthesizeResult();
                
                const riffData = new Array<number>(); // uint8

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
                riffData[22] = 2;    // Stereo
                riffData[23] = 0;
                riffData[24] = 0x44; // 44100 Hz
                riffData[25] = 0xAC;
                riffData[26] = 0x00;
                riffData[27] = 0x00;
                riffData[28] = 0x10; // 44100 * 4 = 176400 bytes / sec
                riffData[29] = 0xB1;
                riffData[30] = 0x02;
                riffData[31] = 0x00;
                riffData[32] = 4;    // 4byte / frame
                riffData[33] = 0;
                riffData[34] = 16;   // 16bit / frame
                riffData[35] = 0;
                riffData[36] = 'd'.charCodeAt(0);
                riffData[37] = 'a'.charCodeAt(0);
                riffData[38] = 't'.charCodeAt(0);
                riffData[39] = 'a'.charCodeAt(0);
                riffData[40] = 0;
                riffData[41] = 0;
                riffData[42] = 0;
                riffData[43] = 0;

                for (let i = 0; i < waveDataR.length; i++) {
                    const subOffset = 44 + i * 4;
                    riffData[subOffset]   = (!waveDataR[i]) ? 0 : waveDataR[i] & 0xFF;
                    riffData[subOffset+1] = (!waveDataR[i]) ? 0 : ((waveDataR[i] >> 8) & 0xFF);
                    riffData[subOffset+2] = (!waveDataL[i]) ? 0 : waveDataL[i] & 0xFF;
                    riffData[subOffset+3] = (!waveDataL[i]) ? 0 : ((waveDataL[i] >> 8) & 0xFF);
                }
                const waveDataSegment = new Uint8Array(riffData);
                Util.setLittleEndianNumberToUint8Array(waveDataSegment, 4, 4, waveDataR.length * 4 + 44);
                Util.setLittleEndianNumberToUint8Array(waveDataSegment, 24, 4, byteRate); // bitrate (default : 44100Hz)
                Util.setLittleEndianNumberToUint8Array(waveDataSegment, 28, 4, byteRate*4); // sample rate (4byte * bitrate)
                Util.setLittleEndianNumberToUint8Array(waveDataSegment, 40, 4, waveDataR.length * 4);
                result.waveSegment = waveDataSegment;

                if (withEffect) {
                    const riffDataWithEffect = Array.from(riffData);
                    for (let i = 0; i < waveDataWithEffectR.length; i++) {
                        const subOffset = 44 + i * 4;
                        riffDataWithEffect[subOffset]   = (!waveDataWithEffectR[i]) ? 0 : waveDataWithEffectR[i] & 0xFF;
                        riffDataWithEffect[subOffset+1] = (!waveDataWithEffectR[i]) ? 0 : ((waveDataWithEffectR[i] >> 8) & 0xFF);
                        riffDataWithEffect[subOffset+2] = (!waveDataWithEffectL[i]) ? 0 : waveDataWithEffectL[i] & 0xFF;
                        riffDataWithEffect[subOffset+3] = (!waveDataWithEffectL[i]) ? 0 : ((waveDataWithEffectL[i] >> 8) & 0xFF);
                    }
                    const waveDataSegmentWithEffect = new Uint8Array(riffDataWithEffect);
                    Util.setLittleEndianNumberToUint8Array(waveDataSegmentWithEffect, 4, 4, waveDataWithEffectR.length * 4 + 44);
                    Util.setLittleEndianNumberToUint8Array(waveDataSegmentWithEffect, 24, 4, byteRate); // bitrate (default : 44100Hz)
                    Util.setLittleEndianNumberToUint8Array(waveDataSegmentWithEffect, 28, 4, byteRate*4); // sample rate (4byte * bitrate)
                    Util.setLittleEndianNumberToUint8Array(waveDataSegmentWithEffect, 40, 4, waveDataWithEffectR.length * 4);
                    result.waveSegmentWithEffect = waveDataSegmentWithEffect;
                    const riffDataOnlyEffect = Array.from(riffData);
                    for (let i = 0; i < waveDataWithEffectR.length; i++) {
                        const subOffset = 44 + i * 4;
                        riffDataOnlyEffect[subOffset]   = (!waveDataOnlyEffectR[i]) ? 0 : waveDataOnlyEffectR[i] & 0xFF;
                        riffDataOnlyEffect[subOffset+1] = (!waveDataOnlyEffectR[i]) ? 0 : ((waveDataOnlyEffectR[i] >> 8) & 0xFF);
                        riffDataOnlyEffect[subOffset+2] = (!waveDataOnlyEffectL[i]) ? 0 : waveDataOnlyEffectL[i] & 0xFF;
                        riffDataOnlyEffect[subOffset+3] = (!waveDataOnlyEffectL[i]) ? 0 : ((waveDataOnlyEffectR[i] >> 8) & 0xFF);
                    }
                    const waveDataSegmentOnlyEffect = new Uint8Array(riffDataOnlyEffect);
                    Util.setLittleEndianNumberToUint8Array(waveDataSegmentOnlyEffect, 4, 4, waveDataWithEffectR.length * 4 + 44);
                    Util.setLittleEndianNumberToUint8Array(waveDataSegmentOnlyEffect, 24, 4, byteRate); // bitrate (default : 44100Hz)
                    Util.setLittleEndianNumberToUint8Array(waveDataSegmentOnlyEffect, 28, 4, byteRate*4); // sample rate (4byte * bitrate)
                    Util.setLittleEndianNumberToUint8Array(waveDataSegmentOnlyEffect, 40, 4, waveDataWithEffectR.length * 4);
                    result.waveSegmentOnlyEffect = waveDataSegmentOnlyEffect;
                }

                if (outputChannel) {
                    const channelRiffDatas = new Map<number, Uint8Array>();
                    channelIDs.forEach(channelID => {
                        const waveDataR = channelWaveDatas.get(channelID)[0];
                        const waveDataL = channelWaveDatas.get(channelID)[1];
            
                        const mm = channelWaveDataMaxMin.get(channelID);
                        if (!mm)return;
                        const [max, min] = mm;
                        const correctRate = Math.min(1, 32767 / max, -32768 / min);
                        if (correctRate < 1) {
                            for (let offset = 0; offset < maxOffset; offset++) {
                                waveDataR[offset] = Math.round(waveDataR[offset] * correctRate * 0.99);
                                waveDataL[offset] = Math.round(waveDataR[offset] * correctRate * 0.99);
                            }
                        }
                        // RIFFデータを雑に塗り替えながらチャンネル別のwave作成(波形のみ塗りつぶすため問題なし)
                        for (let i = 0; i < waveDataR.length; i++) {
                            const subOffset = 44 + i * 4;
                            riffData[subOffset]   = (!waveDataR[i]) ? 0 : waveDataR[i] & 0xFF;
                            riffData[subOffset+1] = (!waveDataR[i]) ? 0 : ((waveDataR[i] >> 8) & 0xFF);
                            riffData[subOffset+2] = (!waveDataL[i]) ? 0 : waveDataL[i] & 0xFF;
                            riffData[subOffset+3] = (!waveDataL[i]) ? 0 : ((waveDataL[i] >> 8) & 0xFF);
                        }
                        const channelRiffData = new Uint8Array(riffData);
                        Util.setLittleEndianNumberToUint8Array(channelRiffData, 4, 4, waveDataR.length * 4 + 44);
                        Util.setLittleEndianNumberToUint8Array(channelRiffData, 24, 4, byteRate); // bitrate (default : 44100Hz)
                        Util.setLittleEndianNumberToUint8Array(channelRiffData, 28, 4, byteRate*4); // sample rate (4byte * bitrate)
                        Util.setLittleEndianNumberToUint8Array(channelRiffData, 40, 4, waveDataR.length * 4);
                        channelRiffDatas.set(channelID, channelRiffData);
                    });
                    result.channelToWaveSegment = channelRiffDatas;
                }
                result.channelToInstrument = new Map(Array.from(channelIDs).map(channelID => [channelID, channelInfoMap.get(channelID)?.[1]?.insChunk]));

                // ループ設定
                if (loopStartOffset >= 0) {
                    result.loopStartOffset = loopAdjusting ? loopAdjustOffset : loopStartOffset;
                    result.loopLength = loopLength;
                }

                done(result);
            });
        }

        const segmentPartition = 10000;
        const startOffset = 0;
        const endOffset = segmentPartition;
        return processPartialMakeWaveSegment(startOffset, endOffset).then(() => allendCallback());
    }
}
