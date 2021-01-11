import { DLSParser, ParseResult as DLSParseResult } from "./dls";
import { MIDIParser } from "./midi";
import { Synthesizer } from "./synthesizer";
import Chart from 'chart.js';
import { Sample } from "./sample";
import { Util } from "./util";

let canvas : HTMLCanvasElement;
let dlsParseResult : DLSParseResult;
let chart : Chart;

function makeChart(size : number) {
    const datasets = new Array();
    const labels = new Array();
    for (let i = 0; i < size; i++) {
        labels.push(i.toString());
    }
    const c = new Chart(canvas, 
        {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets,
            },
            options: {
                responsive: true,
                title: {
                    display: true,
                    text: 'sample',
                },
                scales: {
                    xAxes: [{
                        display: true,
                        scaleLabel: {
                            display: true,
                            labelString: 'f',
                        },
                    }],
                    yAxes: [{
                        ticks: {
                            suggestedMin: -32768,
                            suggestedMax: 32768,
                        }
                    }]
                }
            }
        }
    );
    canvas.style.display = 'block';
    return c;
}

function resetChart(c : Chart) {
    c.data.datasets = [];
    c.update();
}

function addChartData(/** @type {Chart} */c : Chart, dataArray) {
    c.data.datasets.push({
        label: (c.data.datasets.length + 1).toString(),
        data: dataArray,
        borderColor: `rgb(${Math.round(Math.random() * 256)}, ${Math.round(Math.random() * 256)}, ${Math.round(Math.random() * 256)})`,
        backgroundColor: "rgba(0,0,0,0)",
    });
    c.update();
}

function addChartFromUint8ToInt16(c : Chart, dataArray : Uint8Array) {
    const newArray = new Array();
    for (let i = 0; i < dataArray.length / 2; i++) {
        let v = Util.getLittleEndianNumberFromUint8Array(dataArray, i * 2, 2);
        if (v > 32768) {
            v = -((65536 - v) & 32767);
        }
        if (v === 32768) {v = -v}
        newArray.push(v);
    }
    addChartData(c, newArray);
}

async function loadDLSFile(e : Event) {
    const files = (e.target as HTMLInputElement).files;
    for (let i = 0; i < files.length; i++) {
        /** @type {File} */
        const file : File = files[i];
        const parser = new DLSParser();
        const parseResult = await parser.parseFile(file);
        dlsParseResult = parseResult;

        // 雑にサンプル作成
        Sample.makeWaveSamples(parseResult);
    }
}

async function loadMIDIFile(e : Event) : Promise<void> {
    for (let i = 0; i < (e.target as HTMLInputElement).files.length; i++) {
        const file : File = (e.target as HTMLInputElement).files[i];
        const parser = new MIDIParser();
        const parseResult = await parser.parseFile(file);
        console.log(parseResult);
        const synthesizeResult = await Synthesizer.synthesizeMIDI(parseResult, dlsParseResult);
        const blob = new Blob([synthesizeResult.waveSegment]);
        const url = window.URL.createObjectURL(blob);
        const newAudio = document.createElement('audio');
        newAudio.src = url;
        newAudio.controls = true;

        const audioDiv = document.createElement("div");
        audioDiv.innerText = `Result\n${file.name} => WAVE : `;
        audioDiv.appendChild(newAudio);

        const audioArea = document.getElementById("audioarea");
        audioArea.appendChild(audioDiv);

        synthesizeResult.channelToWaveSegment.forEach((waveSegment, channelID) => {
            const div = document.createElement('div');
            const iLocale = synthesizeResult.channelToInstrument.get(channelID)?.insh.Locale;
            const inam = synthesizeResult.channelToInstrument.get(channelID)?.info?.dataMap.get("INAM");
            div.innerText = `● ${channelID} (${iLocale.ulInstrument} ${iLocale.ulBank}  ${inam}):  `;
            const blob = new Blob([waveSegment]);
            const url = window.URL.createObjectURL(blob);
            const channelAudio = document.createElement('audio');
            channelAudio.src = url;
            channelAudio.controls = true;
            div.appendChild(channelAudio)
            document.getElementById("audioarea").appendChild(div);       
        });

        // 先頭のサンプルチャートを雑に作成
        const dataSize = 1000;
        if (chart) {
            resetChart(chart);
        } else {
            chart = makeChart(dataSize);
        }
        let firstNonZeroOffset = synthesizeResult.waveSegment.findIndex((value, offset) => offset >= 100 && value !== 0);
        const dataset = new Uint8Array(dataSize*2);
        for (let i = 0; i < dataSize; i++) {
            const offset = firstNonZeroOffset + i * 1000;
            dataset.set(synthesizeResult.waveSegment.slice(offset, offset+2), i*2);
        }
        addChartFromUint8ToInt16(chart, dataset);
    }
}

function main() {
    const div1 = document.createElement('div');
    div1.innerText = '1. select "gm.dls"    ';
    const input = document.createElement('input');
    input.type = 'file';
    input.placeholder = 'gm.dls';
    input.accept = 'dls';
    input.addEventListener('change', loadDLSFile);
    div1.appendChild(input);
    document.getElementById('inputarea').appendChild(div1);

    const div2 = document.createElement('div');
    div2.innerText = '2. any midi file (*.mid) (loading will take VERY long time)   ';
    const input2 = document.createElement('input');
    input2.type = 'file';
    input2.accept = 'mid';
    input2.addEventListener('change', loadMIDIFile);
    div2.appendChild(input2);
    document.getElementById('inputarea').appendChild(div2);

    canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 720;
    canvas.style.display = 'none';
    document.getElementById('chart').appendChild(canvas);
}

window.addEventListener('DOMContentLoaded', main);