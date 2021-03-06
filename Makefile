EMCC := emcc
SRCS_OGG := $(wildcard libogg/src/*.c)
OBJECTS_OGG := $(patsubst libogg/src/%.c,building/libogg/%.o,$(wildcard libogg/src/*.c))
SRCS_VORBIS := $(filter-out libvorbis/lib/psytune.c libvorbis/lib/tone.c libvorbis/lib/barkmel.c,$(wildcard libvorbis/lib/*.c))
OBJECTS_VORBIS := $(patsubst libvorbis/lib/%.c,building/libvorbis/%.o,$(SRCS_VORBIS))

app : building/libogg.o building/libvorbis.o building/app.o | dist
	$(EMCC) building/libogg.o building/libvorbis.o building/app.o -o ./app.html -lidbfs.js --pre-js building/pre.js --post-js building/post.js --shell-file building/shell.html -s FORCE_FILESYSTEM=1 -s EXPORTED_FUNCTIONS='["_waveToOGGVorbis","_addReadBuffer","_clearReadBuffer"]'

building/app.o : building/app.c
	$(EMCC) -I libogg/include -I libvorbis/include -c $< -o $@

building/libogg.o : $(OBJECTS_OGG)
	$(EMCC) -r $(wildcard building/libogg/*.o) -o building/libogg.o

building/libvorbis.o : $(OBJECTS_VORBIS)
	$(EMCC) -r $(patsubst %,-r %,$(wildcard building/libvorbis/*.o)) -o building/libvorbis.o

$(OBJECTS_OGG) : $(SRCS_OGG) | libogg/include/ogg/config_types.h building
	$(EMCC) -I libogg/include -c $(patsubst building/libogg/%.o,libogg/src/%.c,$@) -o $@

$(OBJECTS_VORBIS) : $(SRCS_VORBIS)
	$(EMCC) -I libogg/include -I libvorbis/include -I libvorbis/lib -c $(patsubst building/libvorbis/%.o,libvorbis/lib/%.c,$@) -o $@

libogg/include/ogg/config_types.h :
	cd libogg
	bash autogen.h
	bash configure
	cd -

building :
	mkdir building
	mkdir building/libogg
	mkdir building/libvorbis

dist :
	mkdir dist

clean :
	@rm building/libogg/*.o
	@rm building/libvorbis/*.o
	@rm building/libogg.o
	@rm building/libvorbis.o
