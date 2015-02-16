var context = new (window.AudioContext || window.webkitAudioContext)();
var canvas = document.getElementById('oscilliscope')
var canvasCtx = canvas.getContext('2d');
var WIDTH = 500;
var HEIGHT = 500;
canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
var bytes;
navigator.getUserMedia = (navigator.getUserMedia ||
                          navigator.webkitGetUserMedia ||
                          navigator.mozGetUserMedia ||
                          navigator.msGetUserMedia);

function getMicSource(cb, cbErr) {
    navigator.getUserMedia({audio: true}, function(stream) {
        cb(context.createMediaStreamSource(stream));    
    }, cbErr)
}

var scale = [0, 200, 400, 500, 700, 900, 1100];
var alts = [100, 300, 300, 600, 800, 1000, 1000];
var bases = [261.262, 130.813,  523.251, 1046.50, 87.3071,];
var symbols = 'abcdefghi-jklm nop\nqrstuvwxyz\'♥'.split('');

function makemap(octaves, scale) {
    var map = [];
    symbols.forEach(function(c, i) {
        var baseFreq = octaves[Math.floor(i/scale.length)];
        var cents1 = scale[i % scale.length];
        var freq1 = baseFreq * Math.pow(2, cents1/1200.0);
        map.push({freq: freq1, c: c});
    });
    function sortFunc(a, b) {
        if (a.freq > b.freq) { return 1; }
        if (a.freq < b.freq) { return -1; }
        return 0;
    }
    map.sort(sortFunc);
    return map;
}
var map1 = makemap(bases, scale);
var map2 = makemap(bases, alts);
function findLetter(map, freq) {
    var min = 10000000;
    var letters = [];
    map.forEach(function(pair) {
        var diff = Math.abs(Math.log2(pair.freq / freq));
        if (diff < .05) {
            letters.push(pair.c);
        }
    });
    return letters;
}

function decode(input, cb) {
    var message = [];
    var analyser = context.createAnalyser();
    var lastFreq = 1;
    var alt = false;
    var sameFreqCount = 0;
    var THRESHOLD = 50;
    analyser.fftSize = 2048;
    var times = new Float32Array(analyser.fftSize);
    bytes = new Uint8Array(analyser.fftSize);
    input.connect(analyser);
    function read() {
        setTimeout(read, 17);
        analyser.getFloatTimeDomainData(times);
        var freq = autoCorrelate(times, context.sampleRate);
        var isValid = freq > 0 && freq < 3000;
        if (!isValid) {
            return;
        }
        var diffCents = Math.abs(1200*Math.log2(freq / lastFreq));
        //console.log(freq, lastFreq, diffCents, sameFreqCount);
        if (diffCents > THRESHOLD) {
            console.log('new note', freq);
            lastFreq = freq;
            sameFreqCount = 0;
        } else {
            sameFreqCount++;
            console.log(sameFreqCount, freq);
            if (sameFreqCount != 3) {
                return;
            }
            var l1 = findLetter(map1, freq)[0];
            var l2 = findLetter(map2, freq);
            console.log(l1, l2);
            if (alt && l2.length) {
                l2.forEach(function(l) { 
                    if (message[0] == l) {
                        message.unshift(l); 
                        alt = false;
                    }
                });
            } else if (l1 && !alt && message[0] != l1) {
                message.unshift(l1);
                alt = false;
            }
            message.reverse();
            cb(message);
            message.reverse();
        }
    }
    read();
}

var MIN_SAMPLES = 0;  // will be initialized when AudioContext is created.

function autoCorrelate( buf, sampleRate ) {
	var SIZE = buf.length;
	var MAX_SAMPLES = Math.floor(SIZE/2);
	var best_offset = -1;
	var best_correlation = 0;
	var rms = 0;
	var foundGoodCorrelation = false;
	var correlations = new Array(MAX_SAMPLES);

	for (var i=0;i<SIZE;i++) {
		var val = buf[i];
		rms += val*val;
	}
	rms = Math.sqrt(rms/SIZE);
	if (rms<0.01) // not enough signal
		return -1;

	var lastCorrelation=1;
	for (var offset = MIN_SAMPLES; offset < MAX_SAMPLES; offset++) {
		var correlation = 0;

		for (var i=0; i<MAX_SAMPLES; i++) {
			correlation += Math.abs((buf[i])-(buf[i+offset]));
		}
		correlation = 1 - (correlation/MAX_SAMPLES);
		correlations[offset] = correlation; // store it, for the tweaking we need to do below.
		if ((correlation>0.9) && (correlation > lastCorrelation)) {
			foundGoodCorrelation = true;
			if (correlation > best_correlation) {
				best_correlation = correlation;
				best_offset = offset;
			}
		} else if (foundGoodCorrelation) {
			// short-circuit - we found a good correlation, then a bad one, so we'd just be seeing copies from here.
			// Now we need to tweak the offset - by interpolating between the values to the left and right of the
			// best offset, and shifting it a bit.  This is complex, and HACKY in this code (happy to take PRs!) -
			// we need to do a curve fit on correlations[] around best_offset in order to better determine precise
			// (anti-aliased) offset.

			// we know best_offset >=1, 
			// since foundGoodCorrelation cannot go to true until the second pass (offset=1), and 
			// we can't drop into this clause until the following pass (else if).
			var shift = (correlations[best_offset+1] - correlations[best_offset-1])/correlations[best_offset];  
			return sampleRate/(best_offset+(8*shift));
		}
		lastCorrelation = correlation;
	}
	if (best_correlation > 0.01) {
		return sampleRate/best_offset;
	}
	return -1;
}

var times;

function draw() {
    requestAnimationFrame(draw);
    if (!bytes || !bytes.length) { return; }

      canvasCtx.fillStyle = 'rgb(200, 200, 200)';
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(0, 0, 0)';

      canvasCtx.beginPath();

      var sliceWidth = WIDTH * 1.0 / bytes.length;
      var x = 0;

      for(var i = 0; i < bytes.length; i++) {
   
        var v = bytes[i] / 128.0;
        var y = v * HEIGHT/2;

        if(i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height/2);
      canvasCtx.stroke();
}

getMicSource(function(input) {
    //draw();
    decode(input, function(msgSoFar) {
        document.getElementById('text').value = msgSoFar.join('');
    });
}, function(err) { document.getElementById('text').value = 'oops couldn\'t get audio input'; });
