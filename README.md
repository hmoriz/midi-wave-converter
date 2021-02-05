# midi-wave-ogg-converter

- MIDI -> WAVE版 https://hmoriz.github.io/midi-wave-converter/release/index.html  
- MIDI -> WAVE -> OGG版(WAVE -> OGG はemscripten) https://hmoriz.github.io/midi-wave-converter/release/app.html  

ブラウザ上でシンセサイズしてMIDIをwave or OGG Vorbisに変換させるwebツール(Parcelを使ってます)  
ブラウザ上で再生することができなくなってしまったMIDIの音を、 ゲイツシンセとも言われている Microsoft GS Wavetable SW Synth をできるだけ再現しながらwaveとして再生可能なものにします。
現時点ではJavaScript(TypeScript)で直接MIDI->Wave変換しているのでだいぶ遅いです。 一応バックグラウンド的な動作にはしてあるけどデベロッパーコンソールを開いて動作させたほうが良いかも(ただし、 ゴミログがめちゃくちゃ多い点に注意)

また、 OGG版の方では MIDIからWaveを経由してOGGまで変換するところまでやります。 (Qualityは雑に0.5固定)
RPGツクールMVで再生できるVorbis形式です。 oggをダウンロード後ツクールでインポートするといい感じに再生されるはずです。  
MIDIに埋め込まれたループタグ(CC111)をOGGに適用させることにより、 OGGでもMIDIと同様のループを実現させることができます(むしろこいつがこのツールの本体だと思う)  
さらに、 MIDI -> OGGの変換によるループがきれいにつながらないケースに対応するための「ループ位置補正機能」オプションもあったりします(後述)

## 使い方

(OGG版も基本的には同じです。 要gm.dls)

1. gm.dls のファイル選択を開いて Windowsの C:¥Windows¥System32¥drivers の中に入っていると思われる「gm.dls」を選ぶ (gm.dlsをアップロードするわけにもいかないので……)
2. 好きなMIDIファイルを選ぶ。なお現バージョンでは「XG音源」には対応できてないためGMな音が出ます(別のdlsファイルをツッコんだ場合は除く)
3. 待つ。 進捗が適当に数字として表示されてるはず(重い処理が入っているため鈍くなりがちです)
4. 生成されたものは `<audio>` で表示されるのであとは好きにしてください (OGG版ではデータとしてループタグが埋め込まれているのでoggとしてダウンロードした上でRPGツクールMV etc.にインポートすればループも織り込まれているはずです)

### ループ位置補正機能(オプション)

「Adjust Loop offset」にチェックを入れるとWAV, OGG変換時にループの位置をいい感じに補正させる機能があります(補正位置は自動で決められます)
RPGツクールXP等のRTPのMIDIをOGGに変換した際にループ先の直前に音が発せられているためにその音が残ってループ時にそれらの音がまじった汚い繋がり方になるケースがありそれを防ぐための処理となります。

ループ補正に当たり、 ループ先の一部をループ元に持っていくという対応を行っているため、 ループなしで再生させると末尾がすごく中途半端な終わり方をします。 そのためチェックを入れる場合は「RPGツクール等でループさせる前提」で使用してくだされればと思います。
当然ですがそもそもMIDIにループ記号が存在してない場合はチェックを入れても今までと変わらないwav, oggが生成されます。 また、 補正なしのほうが自然なループになるケースも存在してます(体感だとRPGツクールXPの多くのMIDIでは不要、 2000, 2003のMIDIをMVで再生させたいならチェックしたほうが良い)

## 注意点

* Windowsでの動作を想定していますが、 生成されるものがWAVEファイルなためgm.dlsさえ持っていればたぶんWindows以外でも動作します。
* 所詮1人の個人がその場の勢いで作成したものなため、 正しい動作の保証は一切できないです。
* 作者は「シミュレーションRPG95のサンプルのBGM」と「RPGツクールXPのRTP曲」で多少の動作確認をしてます。
* OGGのループの再生は一応プレビュー機能も入れてますが、 RPGツクールMVで動作確認してます。
* このツールを用いて生成されたwavファイルの使用許諾みたいなのはもとのMIDIファイルが配布されてたサイト等の規則に従ってください。 それをweb上にアップロードして作者と問題が発生した場合このツールの作者は何も対応できません。

## TODO

(プルリクエスト投げてくれるとすごく嬉しいな)

* ~進捗をブラウザで表示させられるようにする(フリーズ回避)~ やった
* CC64(ホールド)
* RPGツクール2003のRTP曲で変換できないやつが存在しているのを修正
* GS, XG対応
* その他Windows Media Playerと明らかに異なる部分の修正
* MIDI Synthesizer もWASMにしたほうが速そう

## その他

* [Timidity++](http://timidity.sourceforge.net/) というみんな知っているであろう偉大なるツールと非公式ながらかなり洗練され2020年になってもなお更新が入っているらしい [Timidity41](https://ja.osdn.net/projects/timidity41/) というツールをかなり参考にしてます。 感謝
* libOGG, libVorbisを使用してます(流石にVorbisエンコーダ自前実装は無理だった……)
