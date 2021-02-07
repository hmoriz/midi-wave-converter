import { ParseResult } from "./dls";
import { Synthesizer } from "./synthesizer";
import { Util } from "./util";


export namespace Sample {
    // 雑にサンプル作成
    export function makeWaveSamples(dlsInfo : ParseResult) {
        const samplingDIV = document.getElementById('sampling');
        if (!samplingDIV) return;
        samplingDIV.textContent = "・ 各数値(Bank ID)をクリックすることでwaveサンプルを展開(時間がかかります)";
        const {instrumentIDNameBankMap, instrumentIDMap} = dlsInfo;
        console.log(instrumentIDMap);
        instrumentIDNameBankMap.forEach((inamBankIDDataMap, id) => {
            const pElem = document.createElement('p');
            pElem.innerText = id.toString();
            inamBankIDDataMap.forEach((bankIDDataMap, inam) => {
                const cdiv = document.createElement('div');
                cdiv.innerText = '☆ ' + inam;
                bankIDDataMap.forEach((data, bankID) => {
                    const {insChunk} = data;
                    let lart = insChunk.lart;
                    let art1Info = Synthesizer.getArt1InfoFromLarts(lart);
                    if (art1Info.EG2SustainLevel !== 0) {
                        console.error(data.insChunk);
                    }
                    console.log(id, bankID, insChunk, lart, art1Info, data.waves);
                    const button = document.createElement('button');
                    button.innerText = bankID.toString();
                    button.addEventListener('click', () => {
                        const ccdiv = document.createElement('div');
                        ccdiv.innerText = '● ' + bankID;
                        ccdiv.appendChild(document.createElement('br'));
                        // とりあえずボリュームは100で固定させ, ノートIDを変化させてサンプルを用意する
                        for (let noteID = 0; noteID < 128; noteID++) {
                            const regionData = data.insChunk.lrgn.rgnList.find(rgn => {
                                return rgn.rgnh.rangeKey.usLow <= noteID && 
                                    noteID <= rgn.rgnh.rangeKey.usHigh &&
                                    rgn.rgnh.rangeVelocity.usLow <= 100 &&
                                    100 <=  rgn.rgnh.rangeVelocity.usHigh;
                            });
                            if (!lart) {
                                lart = regionData.lart;
                                art1Info = Synthesizer.getArt1InfoFromLarts(lart);
                            }
                            if (!regionData) continue;
                            let wsmp = regionData.wsmp;
                            const wlnk = regionData.wlnk;
                            // const lart = regionData.lart;
                            // console.log(inam, lart);
                            if (!wlnk) return;
                            const wave = {
                                id: wlnk.ulTableIndex,
                                wData: data.waves.get(wlnk.ulTableIndex),
                            }
                            if (!wsmp) {
                                wsmp = wave.wData.wsmpChunk;
                            }
                            if (!wsmp) continue; // ないことはなかったはず

                            const span = document.createElement('span');
                            span.style.display = 'inline-block';
                            span.innerText = '・ ' + noteID;
    
                            const audio = document.createElement('audio');
                            if (wsmp) {
                                const noteOnSec = 10.0; // ノートがオンになっている仮値
                                const waveSec = 12.0 // wave時間の仮値

                                // 元のデータ
                                let segment = new Uint8Array(wave.wData.segmentData);
                                const baseBitRate = Util.getLittleEndianNumberFromUint8Array(segment, 24, 4);
    
                                // waveのdata部分を抽出して変更しやすいようにInt16Array生成
                                const dataSize = Util.getLittleEndianNumberFromUint8Array(segment, wave.wData.dataOffset - 4, 4);
                                const blockAlign = Util.getLittleEndianNumberFromUint8Array(segment, 32, 2); // たぶん2 (16bit monoral)
                                if (blockAlign !== 2) {
                                    throw new Error("Sorry! not implemented for blockAlign " + blockAlign);
                                }
                                let waveDataSegment = new Int16Array(wave.wData.pcmData);
    
                                // ループ設定
                                let baseFrequency = 0;
                                let waveLoopStart = 0;
                                let waveLoopLength = 0;
                                let waveLooping = false;
                                let freqRate = 1;
                                let loopTime = 0;
                                let newWaveSegmentSize = waveDataSegment.length;
                                
                                let unityNote = wsmp.usUnityNote;
                                if (id >= 113) {
                                    // NOTE: どうもそうっぽいので
                                    unityNote = 60;
                                }
                                baseFrequency = Util.getFrequencyFromNoteID(wsmp.usUnityNote);
                                const altFreq = Util.getFrequencyFromNoteID(noteID);
                                freqRate = altFreq / baseFrequency;
                                if (wsmp.waveSampleLoop) {
                                    waveLooping = true;
                                    waveLoopStart = wsmp.waveSampleLoop.ulLoopStart;
                                    waveLoopLength = wsmp.waveSampleLoop.ulLoopLength;
                                    const baseSec = wave.wData.pcmData.length / wave.wData.bytesPerSecond;
                                    const loopSec = wsmp.waveSampleLoop.ulLoopLength / wave.wData.bytesPerSecond;
                                    loopTime = Math.trunc((waveSec - baseSec) / loopSec);
                                    newWaveSegmentSize = newWaveSegmentSize + (loopTime - 1) * waveLoopLength;
                                }
                                
                                console.log(inam, noteID, baseFrequency, altFreq, freqRate, regionData, data.insChunk, lart, art1Info, loopTime, waveDataSegment.length, waveLoopStart, waveLoopLength, waveLoopStart + waveLoopLength, newWaveSegmentSize);
    
                                // 音色改変 (Hz)
                                let newWaveDataSegment = new Int16Array(newWaveSegmentSize);
                                let lastX = 0;
                                let sampleOffsetSpeedGain = 0; // EG2のdxを累積させる用
                                let minY = -1;
                                let maxY = 1;
                                for (let i = 0; i < newWaveDataSegment.length; i++) {
                                    const sec = i / baseBitRate;
    
                                    // EG2(Envelope Generator for Pitch)情報をxに雑に適用
                                    let nextSampleOffsetSpeedGain = sampleOffsetSpeedGain;
                                    if (art1Info) {
                                        let sampleOffsetSpeedCents = 0;
                                        if (art1Info.EG2ToPitch !== 0 ) {
                                            let attackTimeCent = art1Info.EG2AttackTime;
                                            if (art1Info.EG2VelocityToAttack !== -2147483648) {
                                                attackTimeCent += art1Info.EG2VelocityToAttack * (100 / 128);
                                            }
                                            let attackTime = 0;
                                            if (attackTimeCent !== -2147483648) {
                                                attackTime = Synthesizer.getSecondsFromArt1Scale(attackTimeCent);
                                            }
                                            let decayTimeCent = art1Info.EG2DecayTime;
                                            if (art1Info.EG2KeyToDecay !== -2147483648) {
                                                decayTimeCent += art1Info.EG2KeyToDecay * (noteID / 128);
                                            }
                                            let decayTime = 0;
                                            if (decayTimeCent !== -2147483648) {
                                                decayTime = Synthesizer.getSecondsFromArt1Scale(decayTimeCent);
                                            }
                                            if (sec < attackTime) {
                                                // Attack Zone
                                                if (sec === 0) {
                                                    sampleOffsetSpeedCents = 0;
                                                } else {
                                                    sampleOffsetSpeedCents = art1Info.EG2ToPitch * sec / attackTime;
                                                }
                                            } else if (sec < noteOnSec) {
                                                // Decay or Sustain Zone
                                                if (sec === 0 || art1Info.EG2DecayTime === 0) {
                                                    sampleOffsetSpeedCents = 0;
                                                } else {
                                                    if (sec === attackTime) {
                                                        sampleOffsetSpeedCents = art1Info.EG2ToPitch;
                                                    } else {
                                                        sampleOffsetSpeedCents = -art1Info.EG2ToPitch * (sec - attackTime) / decayTime + art1Info.EG2ToPitch;
                                                    }
                                                }
                                                sampleOffsetSpeedCents = Math.max(sampleOffsetSpeedCents, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0);
                                            } else {
                                                // Sustain or Release Zone
                                                let dddx = art1Info.EG2ToPitch;
                                                if (sec === 0 || art1Info.EG2DecayTime === 0) {
                                                    dddx = 0;
                                                } else {
                                                    if (sec !== attackTime) {
                                                        dddx = -art1Info.EG2ToPitch * (sec - attackTime) / decayTime + art1Info.EG2ToPitch;
                                                    }
                                                }
                                                dddx = Math.max(dddx, art1Info.EG2ToPitch * art1Info.EG2SustainLevel / 100.0);
                                                if (art1Info.EG2ReleaseTime === 0) {
                                                    sampleOffsetSpeedCents = 0;
                                                } else {
                                                    if (sec === noteOnSec) {
                                                        sampleOffsetSpeedCents = dddx;
                                                    } else {
                                                        sampleOffsetSpeedCents = -art1Info.EG2ToPitch * (sec - noteOnSec) / art1Info.EG2ReleaseTime + art1Info.EG2ToPitch;
                                                    }
                                                }
                                                // console.log("dddx", dddx, sec-noteOnSec, sampleOffsetSpeedCents);
                                                sampleOffsetSpeedCents = Math.min(sampleOffsetSpeedCents, dddx);
                                            }
                                            // ddx : cent単位
                                            sampleOffsetSpeedCents = Math.max(-1200, Math.min(1200, art1Info.EG2ToPitch, sampleOffsetSpeedCents));
                                        }
                                        // console.log(noteID, i, sec, noteOnSec, sampleOffsetSpeedCents, nextSampleOffsetSpeedGain, art1Info.EG2SustainLevel, art1Info.EG2ToPitch );

                                        // LFO情報もpositionDXに適用 (cent単位)
                                        let lfo = 0;
                                        if (art1Info.LFOToPitch > 0) {
                                            // 遅延が存在する場合は遅延時間以降でサインカーブを生成
                                            if (sec >= art1Info.LFODelay) {
                                                lfo = -Math.sin((sec - art1Info.LFODelay) * Math.PI * 2 * art1Info.LFOFrequency) * art1Info.LFOToPitch;
                                            }
                                        }
                                        sampleOffsetSpeedCents += lfo;
                                        // Key Number To Pitch もpositionDXに反映 (cent単位)
                                        let keyNumberToPitch = 0;
                                        if (art1Info.KeyNumberToPitch > 0) {
                                            keyNumberToPitch = art1Info.KeyNumberToPitch * (noteID / 128);
                                        }
                                        sampleOffsetSpeedCents += keyNumberToPitch;
                                        if (wsmp) {
                                            // sFineTune を加味 (NOTE : DLSの仕様では65536で割るべきっぽいけどgm.dlsのfineTuneの内容的に行わない)
                                            sampleOffsetSpeedCents += wsmp.sFineTune;
                                        }
                                        // dx : 増加率 (1は等倍, 1につき1オクターブ)
                                        nextSampleOffsetSpeedGain = (2 ** (sampleOffsetSpeedCents / 1200));
                                        // if (sec <= 3 && i % 10000 === 0)
                                        //     console.log(noteID, i, x, sec, freqRate, lastX, nextSampleOffsetSpeedGain, sampleOffsetSpeedCents, art1Info.LFOToPitch);
                                    }
                                    let x = lastX + freqRate * nextSampleOffsetSpeedGain;
                                    sampleOffsetSpeedGain = nextSampleOffsetSpeedGain;
                                    lastX = x;

                                    // サンプルwaveのループ部分
                                    if (waveLooping && x >= (waveLoopStart + waveLoopLength)) {
                                        x = ((x - (waveLoopStart + waveLoopLength)) % waveLoopLength) + waveLoopStart;
                                    } else if (!waveLooping && x >= wave.wData.pcmData.length-1) {
                                        continue;
                                    }

                                    let y : number;
                                    // TODO : 一旦「線形補間」
                                    if (Number.isInteger(x)) {
                                        y = waveDataSegment[x];
                                    } else {
                                        const x1 = Math.trunc(x);
                                        const x2 = Math.ceil(x);
                                        const y1 = waveDataSegment[x1];
                                        const y2 = waveDataSegment[x2];
                                        y = (x2 - x) * y1 + (x - x1) * y2;
                                    }
                                    // EG1(Envelope Generator for Volume)情報を反映
                                    let dAttenuation = 96;
                                    let eg1Attenuation = 96;
                                    if (art1Info) {
                                        let attackTime = 0;
                                        let attackTimeCent = -2147483648;
                                        if (art1Info.EG1AttackTime !== -2147483648) {
                                            attackTimeCent = art1Info.EG1AttackTime;
                                        }
                                        if (art1Info.EG1VelocityToAttack !== -2147483648) {
                                            attackTimeCent += art1Info.EG1VelocityToAttack * (100 / 128);
                                        }
                                        if (attackTimeCent !== -2147483648) {
                                            attackTime = Synthesizer.getSecondsFromArt1Scale(attackTimeCent);
                                        }
                                        let decayTime = 0;
                                        let decayTimeCent = -2147483648;
                                        if (art1Info.EG1DecayTime !== -2147483648) {
                                            decayTimeCent = art1Info.EG1DecayTime;
                                        }
                                        if (art1Info.EG1KeyToDecay !== -2147483648) {
                                            decayTimeCent += art1Info.EG1KeyToDecay * (100 / 128);
                                        }
                                        if (decayTimeCent !== -2147483648) {
                                            decayTime = Synthesizer.getSecondsFromArt1Scale(decayTimeCent);
                                        }
                                        if (sec < attackTime) {
                                            // Attack Zone
                                            eg1Attenuation = Math.min(96, sec === 0 ? 96 : 20 * Math.log10(attackTime / sec));
                                        } else if (sec < noteOnSec) {
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
                                                if (sec === noteOnSec) {
                                                    eg1Attenuation = dAttenuation;
                                                } else {
                                                    eg1Attenuation = 96 * (sec - noteOnSec) / art1Info.EG1ReleaseTime;
                                                }
                                            }
                                            eg1Attenuation = Math.max(eg1Attenuation, dAttenuation);
                                        }
                                        eg1Attenuation = Math.min(96, Math.max(0, eg1Attenuation));
                                        //if (Math.abs(sec-noteSec) <= 1.0) console.log(offset, channelID, noteID, sec, sec-noteSec, sec <= attackTime, sec-noteSec <= 0, eg1Attenuation, dAttenuation, attackTime, art1Info.EG1AttackTime, art1Info.EG1VelocityToAttack);
                                    }
                                    // LFO情報を反映
                                    let lfo = 0;
                                    let lfoAttenuation = 0;
                                    if (art1Info) {
                                        if (art1Info.LFOToVolume > 0) {
                                            // 遅延が存在する場合は遅延時間以降でサインカーブを生成
                                            if (sec >= art1Info.LFODelay) {
                                                lfo = Math.sin((sec - art1Info.LFODelay) * Math.PI * 2 / art1Info.LFOFrequency) * art1Info.LFOToVolume;
                                                lfoAttenuation = lfo;
                                            }
                                        }
                                    }
                                    // WSMPのAttenuationを加味
                                    let wsmpAttenuation = 0;
                                    if (wsmp) {
                                        if (wsmpAttenuation === 0x80000000) {
                                            y = 0;
                                        }
                                        wsmpAttenuation = wsmp.lAttenuation / 65536 / 40;
                                    }
                                    y = (y * (0.1 ** ((Math.max(0, eg1Attenuation + wsmpAttenuation + lfoAttenuation)) / 20))) * (90.0 / 100.0);
                                    // if (sec <= 3.0 && i % 1000 === 0) {
                                    //     console.log(noteID, i, sec, x, y, eg1Attenuation, wsmpAttenuation, lfoAttenuation, 0.1 ** ((Math.max(0, eg1Attenuation + wsmpAttenuation + lfoAttenuation)) / 20));
                                    // }
    
                                    newWaveDataSegment.set([y], i);
                                    minY = Math.min(minY, y);
                                    maxY = Math.max(y, maxY);
                                }
                                waveDataSegment = newWaveDataSegment;
    
                                const compressMax = Math.abs(maxY) / 32767;
                                const compressMin = Math.abs(minY) / 32767;
                                const compress = Math.max(compressMax, compressMin);
                                if (compress>= 1) {
                                    for (let i = 0; i < waveDataSegment.length; i++) {
                                        waveDataSegment.set([Math.round(waveDataSegment[i] / compress * 0.9)], i);
                                    }
                                }
                                
                                //const dataSize = getLittleEndianNumberFromUint8Array(segment, 86, 4);
                                // Int16ArrayをUint8Arrayに戻して新しいSegmentを作る
                                const newDataSize = waveDataSegment.length * 2;
                                const newWaveSize = segment.length + (newDataSize - dataSize);
                                const newSegment = new Uint8Array(newWaveSize);
                                newSegment.set(segment, 0);
                                newSegment.set(segment.slice(wave.wData.dataOffset + dataSize), wave.wData.dataOffset + newDataSize);
                                Util.setLittleEndianNumberToUint8Array(newSegment, 4, 4, newWaveSize);
                                Util.setLittleEndianNumberToUint8Array(newSegment, wave.wData.dataOffset - 4, 4, newDataSize);
                                for (let i = 0; i < waveDataSegment.length; i++) {
                                    Util.setLittleEndianNumberToUint8Array(newSegment, 90 + i * 2, 2, waveDataSegment[i]);
                                }
    
                                const newBlob = new Blob([newSegment], { type: 'audio/wav' });
                                audio.src = window.URL.createObjectURL(newBlob);
                            } else {
                                audio.src = window.URL.createObjectURL(wave.wData.waveData);
                            }
                            audio.controls = true;
                            span.appendChild(audio);
                            ccdiv.appendChild(span);
                        };
                        // data.waves.forEach(wdata => {
                        //     const span = document.createElement('span');
                        //     span.style.display = 'inline-block';
                        //     span.innerHTML = '・ ' + wdata.id;
                        //     const audio = document.createElement('audio');
                        //     audio.src = wdata.wave.wave;
                        //     audio.controls = true;
                        //     span.appendChild(audio);
                        //     ccdiv.appendChild(span);
                        //     button.style.display = 'none';
                        // });
                        cdiv.appendChild(ccdiv);
                    });
                    cdiv.appendChild(button);
                });
                pElem.appendChild(cdiv);
            });
            samplingDIV.appendChild(pElem);
        });
    }
}