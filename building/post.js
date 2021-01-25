const input = document.createElement('input');
input.type = 'file';
document.body.append(input);

input.onchange = (e) => {
    for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const reader = new FileReader();
        new Promise((done) => {
            reader.onload = () => {
                if (!(reader.result instanceof ArrayBuffer))return;
                const array = new Uint8Array(reader.result);
                const segments = Math.ceil(reader.result.byteLength / 16384);
                const segmentDiversion = 100;
                const pieceSegments = Math.trunc(segments / segmentDiversion);
                const lastSegments = segments % segmentDiversion;
                console.log(segments, pieceSegments, lastSegments);

                const subProcess = (j) => {
                    for (let i = 0; i < ((j === pieceSegments) ? lastSegments : segmentDiversion); i++) {
                        const array1 = Uint8Array.from(array.slice((j * segmentDiversion + i) * 16384, (j * segmentDiversion + i + 1) * 16384));
                        ccall("addReadBuffer", "null", ['array', 'number'], [array1, array1.length]);
                    }
                    ccall("waveToOGGVorbis", 'null', ['number', 'number'], [j === 0 ? 1 : 0, j == pieceSegments ? 1 : 0]);
                    ccall("clearReadBuffer", "null", ["null"], []);
                    if (!(j === pieceSegments)) {
                        setTimeout(() => subProcess(j+1), 10);
                    } else {
                        // audio
                        const uint8Array = Uint8Array.from(window.oggData);
                        const blob = new Blob([uint8Array]);
                        const url = window.URL.createObjectURL(blob);
                        const audio = document.createElement('audio');
                        audio.src = url;
                        audio.controls = true;
                        document.body.appendChild(audio);
                        done();
                    }
                }
                subProcess(0);
            }
            reader.readAsArrayBuffer(file);
        });
    }
}