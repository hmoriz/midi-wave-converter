// libvorbisのexampleのencoderがベース

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <math.h>
#include <vorbis/vorbisenc.h>
#include <emscripten/emscripten.h>

#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
#endif

#if defined(__MACOS__) && defined(__MWERKS__)
#include <console.h>
#endif

#define READ 1024
#define READ2 16384
signed char readbuffer[READ*4+44];

unsigned char **readBuffer2;
int readBuffer2Lengths[READ];
int lengthReadBuffer2 = 0;

int main() {
  ogg_stream_state os;

  ogg_page         og;
  ogg_packet       op;

  vorbis_info      vi;
  vorbis_comment   vc;

  vorbis_dsp_state vd;
  vorbis_block     vb;

  int eos=0,ret;
  int i, founddata;

  return 0;

  FILE *fIn, *fOut;

  fIn = fopen("building/input", "r");
  fOut = fopen("output", "w");
  fprintf(stderr, "test %p %p\n", fIn, fOut);

  EM_ASM(
    window.oggData = new Array();
  );

#if defined(macintosh) && defined(__MWERKS__)
  int argc = 0;
  char **argv = NULL;
  argc = ccommand(&argv); /* get a "command line" from the Mac user */
                          /* this also lets the user set stdin and stdout */
#endif
#ifdef _WIN32
  _setmode( _fileno( fIn ), _O_BINARY );
  _setmode( _fileno( fOut ), _O_BINARY );
#endif

  readbuffer[0] = '\0';
  for (i=0, founddata=0; i<30 && ! feof(fIn) && ! ferror(fIn); i++)
  {
    fread(readbuffer,1,2,fIn);

    if ( ! strncmp((char*)readbuffer, "da", 2) ){
      founddata = 1;
      fread(readbuffer,1,6,fIn);
      break;
    }
  }

  vorbis_info_init(&vi);

  // とりあえず 44100Hz 2Chとする (TODO: 要ヘッダ読み込み)
  ret=vorbis_encode_init_vbr(&vi,2,44100,0.1);

  if(ret)exit(1);

  /* add a comment */
  vorbis_comment_init(&vc);
  vorbis_comment_add_tag(&vc,"ENCODER","encoder_example.c");

  /* set up the analysis state and auxiliary encoding storage */
  vorbis_analysis_init(&vd,&vi);
  vorbis_block_init(&vd,&vb);

  srand(time(NULL));
  ogg_stream_init(&os,rand());

  {
    ogg_packet header;
    ogg_packet header_comm;
    ogg_packet header_code;

    vorbis_analysis_headerout(&vd,&vc,&header,&header_comm,&header_code);
    ogg_stream_packetin(&os,&header); /* automatically placed in its own
                                         page */
    ogg_stream_packetin(&os,&header_comm);
    ogg_stream_packetin(&os,&header_code);

    /* This ensures the actual
     * audio data will start on a new page, as per spec
     */
    while(!eos){
      int result=ogg_stream_flush(&os,&og);
      if(result==0)break;
      fwrite(og.header,1,og.header_len,fOut);
      for(i = 0; i < og.header_len; i++) {
        EM_ASM({
          window.oggData.push($0);
        }, og.header[i]);
      }
      fwrite(og.body,1,og.body_len,fOut);
      for(i = 0; i < og.body_len; i++) {
        EM_ASM({
          window.oggData.push($0);
        }, og.body[i]);
      }
    }

  }

  while(!eos){
    long i;
    // Wave読み込み(4 * READ バイト単位)
    long bytes=fread(readbuffer,1,READ*4, fIn); /* stereo hardwired here */

    if(bytes==0){
      // WaveのEOF -> OGG Vorbisも最終チャンクにするための処理
      vorbis_analysis_wrote(&vd,0);
    }else{
      // Waveを読み込みエンコード用バッファに投入
      float **buffer=vorbis_analysis_buffer(&vd,READ);

      // チャンネル -> offset で 0~1のPCMデータを投入
      for(i=0;i<bytes/4;i++){
        buffer[0][i]=((readbuffer[i*4+1]<<8)|
                      (0x00ff&(int)readbuffer[i*4]))/32768.f;
        buffer[1][i]=((readbuffer[i*4+3]<<8)|
                      (0x00ff&(int)readbuffer[i*4+2]))/32768.f;
      }
      // OGG Vorbis準備
      vorbis_analysis_wrote(&vd,i);
    }

    while(vorbis_analysis_blockout(&vd,&vb)==1){

      /* analysis, assume we want to use bitrate management */
      vorbis_analysis(&vb,NULL);
      vorbis_bitrate_addblock(&vb);

      while(vorbis_bitrate_flushpacket(&vd,&op)){

        /* weld the packet into the bitstream */
        ogg_stream_packetin(&os,&op);

        // OggSチャンク単位で出力してく
        while(!eos) {
          int result=ogg_stream_pageout(&os,&og);
          if(result==0)break;
          fprintf(stderr, "test %ld %ld\n", og.header_len, og.body_len);
          fwrite(og.header,1,og.header_len,fOut);
          for(i = 0; i < og.header_len; i++) {
            EM_ASM({
              window.oggData.push($0);
            }, og.header[i]);
          }
          fwrite(og.body,1,og.body_len,fOut);
          for(i = 0; i < og.body_len; i++) {
            EM_ASM({
              window.oggData.push($0);
            }, og.body[i]);
          }

          // 終端チャンクだったら終了フラグ
          if(ogg_page_eos(&og))eos=1;
        }
      }
    }
  }

  // メモリを開放してあげる (Cでは必要だった後処理)
  ogg_stream_clear(&os);
  vorbis_block_clear(&vb);
  vorbis_dsp_clear(&vd);
  vorbis_comment_clear(&vc);
  vorbis_info_clear(&vi);

  fprintf(stderr,"Done.\n");

  // ブラウザ上に<audio>生成 (ASM使用)
  EM_ASM({
    const uint8Array = Uint8Array.from(window.oggData);
    const blob = new Blob([uint8Array]);
    const url = window.URL.createObjectURL(blob);
    const audio = document.createElement('audio');
    audio.src = url;
    audio.controls = true;
    document.body.appendChild(audio);
  });

  return(0);
}

// NOTE: メモリを溢れさせないために addReadBuffer適度回->waveToOGG->clearReadBufferを回す形を取る
void addReadBuffer(char *waveDataPiece, int waveLength) {
  if (!readBuffer2) {
    readBuffer2 = calloc(1024, sizeof (char **));
  }
  if (!readBuffer2[lengthReadBuffer2]) {
    readBuffer2[lengthReadBuffer2] = calloc(waveLength, sizeof (char *));
  }
  if (waveLength > READ2*4+44) {
    fprintf(stderr, "size %d is over %d", waveLength, READ2*4+44);
    return;
  }
  memcpy(readBuffer2[lengthReadBuffer2], waveDataPiece, waveLength);
  readBuffer2Lengths[lengthReadBuffer2] = waveLength;
  fprintf(stderr, "addReadBuffer %d %d %d\n", waveLength, READ2*4+44, lengthReadBuffer2);
  lengthReadBuffer2++;
  return;
}

void clearReadBuffer() {
  int i;
  fprintf(stderr, "clearReadBuffer %d\n", lengthReadBuffer2);
  for (i = 0; i < lengthReadBuffer2; i++) {
    free(readBuffer2[i]);
    readBuffer2[i] = 0;
    readBuffer2Lengths[i] = 0;
  }
  lengthReadBuffer2 = 0;
}


ogg_stream_state os2;

ogg_page         og2;
ogg_packet       op2;

vorbis_info      vi2;
vorbis_comment   vc2;

vorbis_dsp_state vd2;
vorbis_block     vb2;

void waveToOGGVorbis(int firstSegment, int lastSegment, char *loopStart, char *loopLength) {
  int dataOffset;
  char headerBuffer[4];
  int sampleRate, inputChannels;
  int i, j, foundData, ret;

  // 先頭がRIFFかどうか確認
  if (firstSegment) {
    strncpy(headerBuffer, (char *)(readBuffer2[0]), 4);
    fprintf(stderr, "test2 %s, %d \n", headerBuffer, strncmp(headerBuffer, "RIFF", 4));
    if (strncmp(headerBuffer, "RIFF", 4)) {
      return;
    }
    // 'data' を探す
    for (i=0, foundData=-1; i<100 && i < readBuffer2Lengths[0]; i++) {
      strncpy(headerBuffer, (char *)(readBuffer2[0] + i), 4);
      if (!strncmp(headerBuffer, "data", 4) ){
        foundData = i+8;
        break;
      }
    }
    if (foundData < 0) {
      return;
    }

    sampleRate = (int)readBuffer2[0][24] + 
                 ((int)readBuffer2[0][25] << 8) +
                 ((int)readBuffer2[0][26] << 16) +
                 ((int)readBuffer2[0][27] << 24);
    inputChannels = (int)(readBuffer2[0][22]); // NOTE: 本当は2byte

    EM_ASM(
      window.oggData = new Array();
    );

    vorbis_info_init(&vi2);
    fprintf(stderr, "test1 %d %d %d %p\n", foundData, sampleRate, inputChannels, &vi2);

    // とりあえず 44100Hz 2Chとする (TODO: 要ヘッダ読み込み)
    ret=vorbis_encode_init_vbr(&vi2,inputChannels,sampleRate,0.5);

    if(ret)exit(ret);

    /* add a comment */
    vorbis_comment_init(&vc2);
    vorbis_comment_add_tag(&vc2,"ENCODER","encoder_example.c");
    if (loopStart > 0) {
      vorbis_comment_add_tag(&vc2, "LOOPSTART", loopStart);
    }
    if (loopLength > 0) {
      vorbis_comment_add_tag(&vc2, "LOOPLENGTH", loopLength);
    }

    /* set up the analysis state and auxiliary encoding storage */
    vorbis_analysis_init(&vd2,&vi2);
    vorbis_block_init(&vd2,&vb2);

    srand(time(NULL));
    ogg_stream_init(&os2,rand());

    // ogg vorbis header chunk
    {
      ogg_packet header;
      ogg_packet header_comm;
      ogg_packet header_code;

      vorbis_analysis_headerout(&vd2,&vc2,&header,&header_comm,&header_code);
      ogg_stream_packetin(&os2,&header); /* automatically placed in its own
                                          page */
      ogg_stream_packetin(&os2,&header_comm);
      ogg_stream_packetin(&os2,&header_code);

      /* This ensures the actual
      * audio data will start on a new page, as per spec
      */
      while(1) {
        int result=ogg_stream_flush(&os2,&og2);
        if(result==0)break;
        for(i = 0; i < og2.header_len; i++) {
          EM_ASM({
            window.oggData.push($0);
          }, og2.header[i]);
        }
        for(i = 0; i < og2.body_len; i++) {
          EM_ASM({
            window.oggData.push($0);
          }, og2.body[i]);
        }
      }

    }
  }

  for(j = 0; j <= lengthReadBuffer2; j++) {
    if (lastSegment && j == lengthReadBuffer2) {
      vorbis_analysis_wrote(&vd2, 0);
    } else if (j == lengthReadBuffer2) {
      break;
    } else {
      int dBytes = (readBuffer2Lengths[j] - (firstSegment && j == 0 ? foundData : 0)) ;
      // fprintf(stderr, "%d %d dBytes : %d\n", j, readBuffer2Lengths[j], dBytes);

      // Waveを読み込みエンコード用バッファに投入
      float **buffer=vorbis_analysis_buffer(&vd2, dBytes/4);

      // チャンネル -> offset で -1~+1のPCMデータを投入
      for(i=0;i<dBytes/4;i++){
        int k = firstSegment && j == 0 ? foundData : 0;
        buffer[0][i]=(((int)(signed char)readBuffer2[j][k+i*4+1]<<8)|
                      (0x00ff&(int)(signed char)readBuffer2[j][k+i*4]))/32768.f;
        buffer[1][i]=(((int)(signed char)readBuffer2[j][k+i*4+3]<<8)|
                      (0x00ff&(int)(signed char)readBuffer2[j][k+i*4+2]))/32768.f;
      }
      // OGG Vorbis準備
      vorbis_analysis_wrote(&vd2, dBytes/4);
    }

    while(vorbis_analysis_blockout(&vd2,&vb2)==1){

      /* analysis, assume we want to use bitrate management */
      vorbis_analysis(&vb2,NULL);
      vorbis_bitrate_addblock(&vb2);

      while(vorbis_bitrate_flushpacket(&vd2,&op2)){
        int eos = 0;

        /* weld the packet into the bitstream */
        ogg_stream_packetin(&os2,&op2);

        // OggSチャンク単位で出力してく
        while(!eos) {
          int result=ogg_stream_pageout(&os2,&og2);
          if(result==0)break;
          fprintf(stderr, "testOggS %d %ld %ld\n", j, og2.header_len, og2.body_len);
          for(i = 0; i < og2.header_len; i++) {
            EM_ASM({
              window.oggData.push($0);
            }, og2.header[i]);
          }
          for(i = 0; i < og2.body_len; i++) {
            EM_ASM({
              window.oggData.push($0);
            }, og2.body[i]);
          }

          // 終端チャンクだったら終了フラグ
          if(ogg_page_eos(&og2))eos=1;
        }
      }
    }
  }


  if (lastSegment) {

    // メモリを開放してあげる (Cでは必要だった後処理)
    ogg_stream_clear(&os2);
    vorbis_block_clear(&vb2);
    vorbis_dsp_clear(&vd2);
    vorbis_comment_clear(&vc2);
    vorbis_info_clear(&vi2);

    fprintf(stderr,"Done.\n");
  }
}