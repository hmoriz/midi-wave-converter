import { Chunk } from "./chunk";

export namespace Synthesizer {
    
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
    
    export function getArt1InfoFromLarts(lart?: Chunk.LartChunk) : Art1Info {
        const ret = new Art1Info();
        if (!lart || !lart.art1List) return ret;
        const art1s = lart.art1List;
        art1s.forEach(art1 => {
            art1.connectionBlocks.forEach(cb => {
                switch (cb.usDestination) {
                    case Chunk.ART1DESTINATION.CONN_LFO_FREQUENCY:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.LFOFrequency = getFrequencyFromArt1CentScale(cb.lScale);
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_LFO_DELAY:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.LFODelay = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG1_ATTACK:
                        if (cb.usSource == Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1AttackTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG1_DECAY:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1DecayTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            ret.EG1KeyToDecay = getFrequencyFromArt1CentScale(cb.lScale);
                            console.log('CONN_EG1_DECAY', 'CONN_SRC_KEYNUMBER', cb.lScale, getFrequencyFromArt1CentScale(cb.lScale));
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG1_RESERVED:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : おそらくここで定義されているのがSUSTAIN_LEVEL
                            ret.EG1SustainLevel = Math.max(0, Math.min(100.0, cb.lScale / 10));
                            if (cb.lScale < 0 || cb.lScale > 1000) {
                                console.warn('CONN_EG1_RESERVED', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            }
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG1_RELEASE:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1ReleaseTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG1_SUSTAIN:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG1ReservedTime = getSecondsFromArt1Scale(cb.lScale);
                            console.log('CONN_EG1_SUSTAIN', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG2_ATTACK:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2AttackTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG2_DECAY:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2DecayTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_KEYNUMBER) {
                            ret.EG2KeyToDecay = getFrequencyFromArt1CentScale(cb.lScale);
                            console.log('CONN_EG2_DECAY', 'CONN_SRC_KEYNUMBER', cb.lScale, getFrequencyFromArt1CentScale(cb.lScale));
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG2_RESERVED:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            // NOTE : おそらくここで定義されているのがSUSTAIN_LEVEL
                            ret.EG2SustainLevel = Math.max(0, Math.min(100.0, cb.lScale / 10));
                            if (cb.lScale < 0 || cb.lScale > 1000) {
                                console.error('CONN_EG2_RESERVED', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            }
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG2_RELEASE:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2ReleaseTime = getSecondsFromArt1Scale(cb.lScale);
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_EG2_SUSTAIN:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_NONE) {
                            ret.EG2ReservedTime = getSecondsFromArt1Scale(cb.lScale);
                            console.log('CONN_EG2_SUSTAIN', cb.lScale, getSecondsFromArt1Scale(cb.lScale));
                            return;
                        }
                        break;
                    case Chunk.ART1DESTINATION.CONN_DST_PITCH:
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_LFO) {
                            // LFO Pitch
                            ret.LFOPitch = getFrequencyFromArt1CentScale(cb.lScale);
                            return;
                        }
                        if (cb.usSource === Chunk.ART1SOURCE.CONN_SRC_EG2) {
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
}
