let source; 
        const playerLogDiv = document.getElementById('playerLog');
        
        function logMessage(message, type = 'info', target = playerLogDiv) {
            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;
            entry.innerHTML = message;
            target.prepend(entry);
        }
        function logToSection(section, message, type = 'info') {
            switch(section) {
                case 'player':
                    logMessage(message, type, playerLogDiv);
                    break;
                case 'all':
                    logMessage(message, type, playerLogDiv);
                    break;
                default:
                    // nothing to do
            }
        }

        //////
        /// Media Player
        //////

        function initializeMediaPlayer() {
            const audioSelect = document.getElementById('audioFileSelect');
            const audioPlayer = document.getElementById('audioPlayer');
            const playerLog = document.getElementById('playerLog');
            
            // Add performance metrics display area
            const metricsDiv = document.createElement('div');
            metricsDiv.id = 'playerMetrics';
            metricsDiv.className = 'section-log';
            metricsDiv.style.maxHeight = '100px';
            metricsDiv.style.marginBottom = '10px';
            audioPlayer.parentNode.insertBefore(metricsDiv, audioPlayer);
            
            // Performance tracking variables
            let loadStartTime = 0;
            let seekStartTime = 0;

            
            function createCustomStreamingPlayer(filePath, fileSize, fileDuration) {
                // Remove any existing player
                const existingPlayer = document.querySelector('.custom-player');
                if (existingPlayer) existingPlayer.remove();

                let activeRequests = []; 
                
                // Create container
                const playerContainer = document.createElement('div');
                playerContainer.className = 'custom-player';
                playerContainer.style.marginTop = '15px';
                playerContainer.style.backgroundColor = '#f8f8f8';
                playerContainer.style.borderRadius = '8px';
                playerContainer.style.padding = '15px';
                playerContainer.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                
                // Create hidden audio element for MediaSource API
                let audioElement = document.createElement('audio');
                audioElement.style.display = 'none';
                function setupAudioElementEventListeners() {
                    // Add all the event listeners to the current audioElement
                    audioElement.addEventListener('canplay', function() {
                        const readyTime = Math.round(performance.now() - loadStartTime);
                        logMetric(`Ready to play in ${readyTime}ms`);
                        loadingIndicator.style.display = 'none';
                    });
                    
                    audioElement.addEventListener('seeking', () => {
                        logMetric(`Browser seeking to ${formatTime(audioElement.currentTime)}...`);
                    });
                    
                    audioElement.addEventListener('seeked', () => {
                        const seekDuration = Math.round(performance.now() - seekStartTime);
                        logMetric(`Seek completed in ${seekDuration}ms`);
                    });
                    
                    audioElement.addEventListener('canplaythrough', () => {
                        logMetric('Buffer ready for continuous playback');
                        loadingIndicator.style.display = 'none';
                    });
                    
                    audioElement.addEventListener('pause', () => {
                        isPlayingCurrentChunk = false;
                        logMetric('Playback paused, chunk prefetching paused');
                    });
                    
                    if ( 0) audioElement.addEventListener('play', () => {
                        isPlayingCurrentChunk = true;
                        logMetric('Playback started, chunk loading enabled');
                        
                        // Load current chunk if needed
                        const currentPos = audioElement.currentTime / fileDuration;
                        loadChunksForPosition(currentPos);
                        
                        // Start the UI update loop
                        updatePlaybackUI();
                    });

                    audioElement.addEventListener('ended', () => {
                        playButton.textContent = 'Play';
                        logToSection('player', 'Playback finished', 'info');
                    });
                    
                    audioElement.addEventListener('loadedmetadata', () => {
                        if (audioElement.duration && isFinite(audioElement.duration)) {
                            duration.textContent = formatTime(audioElement.duration);
                            logMetric(`Media metadata loaded, duration: ${formatTime(audioElement.duration)}`);
                        }
                    });

                    audioElement.addEventListener('durationchange', () => {
                        if (isFinite(audioElement.duration) && audioElement.duration > 0) {
                            duration.textContent = formatTime(audioElement.duration);
                            logMetric(`Duration updated: ${formatTime(audioElement.duration)}`);
                            
                            // Update MediaSource duration if it's significantly different
                            if (Math.abs(mediaSource.duration - audioElement.duration) > 1) {
                                mediaSource.duration = audioElement.duration;
                            }
                        }
                    });
                    
                    audioElement.addEventListener('timeupdate', () => {
                        if (!audioElement.paused) {
                            const currentTime = audioElement.currentTime;
                            const totalDuration = audioElement.duration || fileDuration;
                            const currentPos = currentTime / totalDuration;
                            
                            // Get current byte position and determine what chunk we're in
                            const newChunkIndex = Math.floor(globalSeekTime * fileSize / CHUNK_SIZE);
                            
                            // If we've moved to a new chunk, update tracking
                            if (newChunkIndex !== currentChunkIndex) {
                                currentChunkIndex = newChunkIndex;
                                isPlayingCurrentChunk = true;
                                logMetric(`Now playing chunk ${currentChunkIndex}`);
                            }
                            
                            // Call loadChunksForPosition which will handle the logic for loading
                            // the current chunk and potentially prefetching the next chunk
                            loadChunksForPosition(currentPos);
                        }
                    });

                    audioElement.addEventListener('error', (e) => {
                        const errorMessage = e.target.error ? e.target.error.message : 'Unknown error';
                        console.error('Audio element error:', e.target.error);
                        logMetric(`Error: ${errorMessage}`);
                        loadingIndicator.textContent = `Error: ${errorMessage}`;
                    });
                }
                

                // Create time display row
                const timeDisplay = document.createElement('div');
                timeDisplay.style.display = 'flex';
                timeDisplay.style.justifyContent = 'space-between';
                timeDisplay.style.fontFamily = 'monospace';
                timeDisplay.style.marginBottom = '10px';
                
                const currentTime = document.createElement('span');
                currentTime.textContent = '0:00';
                
                const duration = document.createElement('span');
                //duration.textContent = '0:00'; // Will update when metadata loads
                duration.textContent = formatTime(fileDuration);
                
                timeDisplay.appendChild(currentTime);
                timeDisplay.appendChild(duration);
                
                // Create seek slider
                const seekContainer = document.createElement('div');
                seekContainer.style.width = '100%';
                seekContainer.style.height = '8px';
                seekContainer.style.backgroundColor = '#ddd';
                seekContainer.style.position = 'relative';
                seekContainer.style.cursor = 'pointer';
                seekContainer.style.borderRadius = '4px';
                seekContainer.style.marginBottom = '15px';
                
                const seekFill = document.createElement('div');
                seekFill.style.position = 'absolute';
                seekFill.style.height = '100%';
                seekFill.style.width = '0%';
                seekFill.style.backgroundColor = '#4CAF50';
                seekFill.style.borderRadius = '4px';
                
                const seekHandle = document.createElement('div');
                seekHandle.style.position = 'absolute';
                seekHandle.style.width = '16px';
                seekHandle.style.height = '16px';
                seekHandle.style.borderRadius = '50%';
                seekHandle.style.backgroundColor = 'white';
                seekHandle.style.border = '2px solid #4CAF50';
                seekHandle.style.top = '50%';
                seekHandle.style.transform = 'translate(-50%, -50%)';
                seekHandle.style.left = '0%';
                
                seekContainer.appendChild(seekFill);
                seekContainer.appendChild(seekHandle);
                
                // Create buttons
                const buttonsContainer = document.createElement('div');
                buttonsContainer.style.display = 'flex';
                buttonsContainer.style.gap = '10px';
                buttonsContainer.style.justifyContent = 'center';

                const playButton = document.createElement('button');
                playButton.textContent = 'Play';
                playButton.style.padding = '8px 24px';

                // Add the reset button instead of stop
                const resetButton = document.createElement('button');
                resetButton.textContent = 'Reset';
                resetButton.style.padding = '8px 24px';

                buttonsContainer.appendChild(playButton);
                buttonsContainer.appendChild(resetButton);
                
                // Assemble player
                playerContainer.appendChild(timeDisplay);
                playerContainer.appendChild(seekContainer);
                playerContainer.appendChild(buttonsContainer);
                playerContainer.appendChild(audioElement);
                
                // Loading indicator
                const loadingIndicator = document.createElement('div');
                loadingIndicator.textContent = 'Loading audio file...';
                loadingIndicator.style.textAlign = 'center';
                loadingIndicator.style.margin = '10px 0';
                playerContainer.appendChild(loadingIndicator);
                
                // Hide the original audio element
                const originalAudioPlayer = document.getElementById('audioPlayer');
                originalAudioPlayer.style.display = 'none';
                originalAudioPlayer.parentNode.insertBefore(playerContainer, originalAudioPlayer);
                
                // Performance tracking
                const loadStartTime = performance.now();
                const mimeType = filePath.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4';
                logMetric('Initializing chunked streaming...');
                
                // Setup MediaSource
                let mediaSource = new MediaSource();
                audioElement.src = URL.createObjectURL(mediaSource);
                let sourceBuffer;
                const chunksQueue = [];
                let loadingComplete = false;
                // Track how much we've loaded
                let bytesLoaded = 0;
                
                const CHUNK_SIZE = 512 * 1024; // 512KB chunks
                const WAITFORLOAD = 5000; // 5 seconds wait for lastload
                

                const loadedRanges = [];
                const INITIAL_CHUNKS = 1; // Changed from 2 to only load current chunk
                const AHEAD_CHUNKS = 1;  // Set to 1 to only pre-load the next chunk
                let isLoading = false;
                let currentChunkIndex = 0;
                let isPlayingCurrentChunk = false;
                let absoluteTimeOffset = 0;
                let absoluteTimeUpdateId = null;

                let globalSeekTime = 0;
                let globalIntervals = [];
                let checkLoading = null;

                let done = {}; // { 'chunkIndex': true, ... } for one-time download

                let lastloadtime = 0; // time of the last load
                let lastload = false;


                function startAbsoluteTimelineUpdates(startTimeOffset) {
                    // Clear any existing update interval
                    if (absoluteTimeUpdateId) {
                        clearInterval(absoluteTimeUpdateId);
                    }
                    
                    // Set the starting offset time
                    absoluteTimeOffset = startTimeOffset;
                    const startTimestamp = performance.now();
                    
                    // this should be the only place where we set the globalSeekTime
                    for (const interval of globalIntervals) {
                        clearInterval(interval);
                    }
                    globalIntervals = [];

                    // Update the UI every 100ms to show the correct absolute position
                    absoluteTimeUpdateId = setInterval(() => {
                        if (audioElement.paused) {
                            clearInterval(absoluteTimeUpdateId);
                            absoluteTimeUpdateId = null;
                            return;
                        }
                        
                        // Calculate absolute position: offset + elapsed playback time
                        const elapsedSeconds = (performance.now() - startTimestamp) / 1000;
                        const calculatedTime = absoluteTimeOffset + elapsedSeconds;
                        
                        // Ensure we don't exceed file duration
                        const clampedTime = Math.min(calculatedTime, fileDuration);
                        const currentPos = clampedTime / fileDuration;
                        const chunkTime = audioElement.currentTime;
                        // pick a ratio of chunkTime to fileDuration but considering the file is split int CHUNK_SIZE relative to fileSize
                        globalSeekTime = currentPos;
                        
                        // Update UI
                        updateSeekUI(currentPos);
                        currentTime.textContent = formatTime(clampedTime);
                        
                        // Calculate if we need to load a new chunk based on absolute position
                        const bytePosition = Math.floor(currentPos * fileSize);
                        const newChunkIndex = Math.floor(globalSeekTime * fileSize / CHUNK_SIZE);
                        
                        if ( 0) if (newChunkIndex !== currentChunkIndex) {
                            currentChunkIndex = newChunkIndex;
                            
                            // Load the new chunk if needed
                            const chunkStart = currentChunkIndex * CHUNK_SIZE;
                            const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, fileSize - 1);
                            loadChunk(chunkStart, chunkEnd, currentChunkIndex);
                            
                            logMetric(`Advanced to chunk ${currentChunkIndex} at absolute position ${formatTime(clampedTime)}`);
                        }
                        
                        // Also check if we need to preload the next chunk
                        //const chunkProgress = (bytePosition % CHUNK_SIZE) / CHUNK_SIZE;
                        const chunkProgress = chunkTime / ( fileDuration * ( CHUNK_SIZE / fileSize));
                        //console.log('chunkProgress:', `chunkTime: ${chunkTime}`, `fileDuration: ${fileDuration}`, `CHUNK_SIZE: ${CHUNK_SIZE}`, `fileSize: ${fileSize}`, `→ ${chunkProgress}`);
                        if (chunkProgress >= 0.75 && ! done['' + (currentChunkIndex + 1)]) {
                            console.log('startAbsoluteTimelineUpdates() > 75%, load next chunk, chunkProgress:', chunkProgress);
                            const nextChunkStart = (currentChunkIndex + 1) * CHUNK_SIZE;
                            if (nextChunkStart < fileSize) {
                                const nextChunkEnd = Math.min(nextChunkStart + CHUNK_SIZE - 1, fileSize - 1);
                                console.log('startAbsoluteTimelineUpdates() >75% NEXT CHUNK! nextChunkStart:', nextChunkStart, 'nextChunkEnd:', nextChunkEnd);
                                loadChunk(nextChunkStart, nextChunkEnd, currentChunkIndex + 1);
                            }
                        }
                    }, 800);
                    globalIntervals.push(absoluteTimeUpdateId);
                }

                mediaSource.addEventListener('sourceopen', function() {
                    logMetric('MediaSource opened, preparing stream...');
                    
                    try {
                        // Create source buffer now that MediaSource is open
                        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
                        
                        // Set an initial duration
                        mediaSource.duration = fileDuration;
                        duration.textContent = formatTime(fileDuration);
                        logMetric(`Duration set to ${fileDuration} seconds`);
                        
                        // Set mode to segments for better seeking support
                        if ('mode' in sourceBuffer) {
                            try {
                                sourceBuffer.mode = 'segments';
                                logMetric('Source buffer mode set to segments');
                            } catch (modeError) {
                                logMetric('This format does not support segments mode, using default');
                            }
                        }
                        
                        // Enable update-end event to track when chunks are processed
                        sourceBuffer.addEventListener('updateend', function() {
                            if (chunksQueue.length > 0 && !sourceBuffer.updating) {
                                try {
                                    sourceBuffer.appendBuffer(chunksQueue.shift());
                                } catch (e) {
                                    console.error('Error in updateend handler:', e);
                                    logMetric(`Buffer append error: ${e.message}`);
                                }
                            }
                            
                            if (chunksQueue.length === 0 && loadingComplete && !sourceBuffer.updating) {
                                try {
                                    mediaSource.endOfStream();
                                    logMetric('End of stream signaled');
                                } catch (e) {
                                    console.error('Error ending stream:', e);
                                }
                            }
                        });
                        
                        // Load only the first chunk to start playback
                        loadingIndicator.textContent = 'Loading initial audio data...';
                        
                        const chunkStart = 0;
                        const chunkEnd = Math.min(CHUNK_SIZE - 1, fileSize - 1);
                        
                        loadChunk(chunkStart, chunkEnd).then(() => {
                            logMetric('Initial chunk loaded, ready for playback');
                            loadingIndicator.textContent = 'Ready to play';
                            currentChunkIndex = 0;
                        });
                    } catch (error) {
                        console.error('Error setting up MediaSource:', error);
                        logMetric(`MediaSource setup error: ${error.message}`);
                        loadingIndicator.textContent = `Error: ${error.message}`;
                    }
                });
                
                // Function to check if a byte range is already loaded
                function isRangeLoaded(start, end) {
                    for (const range of loadedRanges) {
                        if (start >= range.start && end <= range.end) {
                            return true;
                        }
                    }
                    return false;
                }

                // Function to merge overlapping ranges
                function mergeRanges() {
                    if (loadedRanges.length <= 1) return;
                    
                    loadedRanges.sort((a, b) => a.start - b.start);
                    
                    const merged = [loadedRanges[0]];
                    
                    for (let i = 1; i < loadedRanges.length; i++) {
                        const current = loadedRanges[i];
                        const previous = merged[merged.length - 1];
                        
                        if (current.start <= previous.end + 1) {
                            // Ranges overlap or are adjacent, merge them
                            previous.end = Math.max(previous.end, current.end);
                        } else {
                            // Ranges don't overlap, add as new range
                            merged.push(current);
                        }
                    }
                    
                    // Replace with merged ranges
                    loadedRanges.length = 0;
                    loadedRanges.push(...merged);
                }

                
                // Function to load a specific chunk
                function loadChunk(start, end, no) {
                    // if there is an active lastload wtihin 5s, wait for it
                    if (lastload && (performance.now() - lastloadtime) < WAITFORLOAD) {
                        //console.log('loadChunk() waiting for lastload');
                        return Promise.resolve();
                    }
                    lastload = true;
                    lastloadtime = performance.now();

                    // Validate inputs to prevent NaN values
                    start = parseInt(start) || 0;
                    end = parseInt(end) || 0;
                    
                    if (isNaN(start) || isNaN(end) || start < 0 || end < 0) {
                        console.error('loadChunk() Invalid range values:', start, end);
                        start = 0;
                        end = Math.min(CHUNK_SIZE - 1, fileSize - 1);
                    }
                    
                    if (start > fileSize - 1) {
                        console.error('loadChunk() Start position beyond file size:', start, fileSize);
                        return Promise.resolve(); // Nothing to load
                    }
                    
                    end = Math.min(end, fileSize - 1);
                    
                    if (isRangeLoaded(start, end)) return Promise.resolve();
                    
                    if ( isLoading) return Promise.resolve();
                    if ( 0) if (isLoading) {
                        // Return a promise that resolves when current loading is done
                        return new Promise((resolve) => {
                            if (checkLoading) { 
                                clearInterval(checkLoading);
                                checkLoading = null;
                            }
                            checkLoading = setInterval(() => {
                                if (!isLoading) {
                                    clearInterval(checkLoading);
                                    checkLoading = null;
                                    resolve(loadChunk(start, end));
                                }
                            }, 100);

                        });
                    }
                    
                    isLoading = true;
                    console.log('loadChunk() set loading=true', start, end);
                    
                    // Ensure we have valid integers for the range
                    const rangeStart = Math.floor(Math.max(0, start));
                    const rangeEnd = Math.floor(Math.max(rangeStart, end));
                    
                    const controller = new AbortController();
                    //const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
                    
                    // Add this request to our active requests list
                    const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
                    activeRequests.push({ id: requestId, controller });
                    
                    logMetric(`Requesting byte range: ${rangeStart}-${rangeEnd}`);
                    console.log('loadChunk() requesting byte range:', rangeStart, rangeEnd);
                    return fetch(`/secure-stream?file=${encodeURIComponent(filePath)}`, {
                        headers: {
                            'Range': `bytes=${rangeStart}-${rangeEnd}`,
                            'auth-key': 'a93874791dd108864'
                        },
                        credentials: 'include',
                        signal: controller.signal
                    })
                    .then(response => {
                        //clearTimeout(timeoutId);
                        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                        console.log('loadChunk() then 1');
                        return response.arrayBuffer();
                    })
                    .then(arrayBuffer => {
                        bytesLoaded += arrayBuffer.byteLength;
                        
                        // Update loading progress
                        const percentLoaded = Math.round((bytesLoaded / fileSize) * 100);
                        loadingIndicator.textContent = `Loaded: ${percentLoaded}% (${formatFileSize(bytesLoaded)})`;
                        console.log('loadChunk() then 2', `Loaded: ${percentLoaded}%`);

                        // Check media element error state before appending
                        if (audioElement.error) {
                            logMetric(`Media element error detected: ${audioElement.error.message}`);
                            isLoading = false;
                            console.error('loadChunk() mediaElement error:', audioElement.error.message);
                            return Promise.reject(new Error(`Media element error: ${audioElement.error.message}`));
                        }

                        // Add to queue or append directly
                        try {
                            console.log('loadChunk() before source buffer appendBuffer');
                            if (sourceBuffer.updating || chunksQueue.length > 0) {
                                console.log('chunkQueue.push()');
                                chunksQueue.push(arrayBuffer);
                            } else {
                                console.log('loadChunk() sourceBuffer.appendBuffer()');
                                sourceBuffer.appendBuffer(arrayBuffer);
                            }
                            console.log('loadChunk() before load ranges');
                            // Record this range as loaded
                            loadedRanges.push({ start, end });
                            console.log('loadChunk() after load ranges, before mergeRanges()');
                            mergeRanges();
                        } catch (error) {
                            console.error('loadChunk() Error with buffer:', error);
                            logMetric(`Buffer error: ${error.message}`);
                        }
                        
                        console.log('loadChunk() loading done, returning arrayBuffer');
                        isLoading = false;
                        done['' + no] = true; // Mark this chunk as done
                        return arrayBuffer;
                    })
                    .catch(error => {
                        //clearTimeout(timeoutId);
                        console.error('Chunk loading error:', error);
                        
                        if ( 0) if (error.name === 'AbortError') {
                            logMetric(`Request timed out. Retrying...`);
                            isLoading = false;
                            return new Promise(resolve => setTimeout(() => resolve(loadChunk(start, end)), 1000));
                        }
                        
                        //loadingIndicator.textContent = `Error: ${error.message}. Retrying...`;
                        //logToSection('player', `Streaming error: ${error.message}`, 'error');
                        //isLoading = false;
                        
                        // Retry after a short delay for network errors
                        //return new Promise(resolve => setTimeout(() => resolve(loadChunk(start, end)), 2000));
                    });
                    
                }


                // Function to load chunks based on current playback position
                function loadChunksForPosition(position) {
                    // Validate position to prevent NaN
                    position = parseFloat(position) || 0;
                    if (isNaN(position) || position < 0) position = 0;
                    if (position > 1) position = 1;
                    
                    // Ensure fileSize is valid
                    if (typeof fileSize !== 'number' || isNaN(fileSize) || fileSize <= 0) {
                        console.error('Invalid fileSize:', fileSize);
                        return Promise.resolve([]);
                    }
                    
                    const newChunkIndex = Math.floor( (globalSeekTime * fileSize) / CHUNK_SIZE);
                    //console.log( 'loadChunksForPosition()', `newChunkIndex: ${newChunkIndex}`, `currentChunkIndex: ${currentChunkIndex}`, `globalSeekTime: ${globalSeekTime}`, `position: ${position}`);
                    
                    // Only load if the chunk index has changed
                    if (newChunkIndex === currentChunkIndex) {
                        // We're still in the same chunk, check if we need to prefetch the next chunk
                        const chunkProgress = audioElement.currentTime / (fileDuration * ( CHUNK_SIZE / fileSize));
                        //console.log('loadChunksForPosition() still current chunk', `chunkTime: ${audioElement.currentTime}`, `chunkProgress: ${chunkProgress}`);

                        // Changed from 0.5 to 0.75 - only load next chunk if we're at least 75% through the current chunk
                        if (chunkProgress >= 0.75 && !audioElement.paused && isPlayingCurrentChunk && ! done['' + ( currentChunkIndex + 1)]) {
                            const nextChunkStart = (currentChunkIndex + 1) * CHUNK_SIZE;
                            //console.log('loadChunksForPosition()  >75%!, nextChunkStart:', nextChunkStart);
                            if (nextChunkStart < fileSize) {
                                const nextChunkEnd = Math.min(nextChunkStart + CHUNK_SIZE - 1, fileSize - 1);
                                logMetric(`Pre-loading next chunk (${currentChunkIndex + 1}) as current chunk is at ${Math.round(chunkProgress * 100)}%`);
                                console.log('loadChunksForPosition() pre-loading next chunk', `currentChunkIndex: ${currentChunkIndex}(+1)`, `nextChunkStart: ${nextChunkStart}`, `nextChunkEnd: ${nextChunkEnd}`);
                                return loadChunk(nextChunkStart, nextChunkEnd, currentChunkIndex + 1);
                            }

                        }
                        return Promise.resolve();
                    } else {
                        // We've moved to a new chunk - load it immediately
                        currentChunkIndex = newChunkIndex;
                        isPlayingCurrentChunk = true;
                        
                        const chunkStart = currentChunkIndex * CHUNK_SIZE;
                        if (chunkStart >= fileSize || done['' + currentChunkIndex]) {
                            return Promise.resolve();
                        }
                        
                        const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, fileSize - 1);
                        logMetric(`Loading current chunk (${currentChunkIndex}) at position ${formatTime(position * fileDuration)}`);
                        console.log('loadChunksForPosition() new chunk!', `currentChunkIndex: ${currentChunkIndex}`, `newChunkIndex: ${newChunkIndex}`);
                        return loadChunk(chunkStart, chunkEnd, currentChunkIndex);
                    }
                }
                
                
                audioElement.addEventListener('canplay', function() {
                    const readyTime = Math.round(performance.now() - loadStartTime);
                    logMetric(`Ready to play in ${readyTime}ms`);
                    loadingIndicator.style.display = 'none';
                });
                
                // Seek functionality
                seekContainer.addEventListener('click', function (e) {
                    // Get position from click
                    const rect = seekContainer.getBoundingClientRect();
                    const position = (e.clientX - rect.left) / rect.width;

                    globalSeekTime = position;
                    currentChunkIndex = Math.floor(globalSeekTime * fileSize / CHUNK_SIZE);
                    done = {}; // reset the done object
                    
                    
                    // Calculate the seek time from position
                    const seekTime = position * fileDuration;
                    seekStartTime = performance.now(); // Track seek performance
                    
                    // Stop any current playback
                    audioElement.pause();
                    
                    // Completely destroy the current player
                    destroyMediaPlayer();
                    
                    // Create a new, empty audio element
                    audioElement = document.createElement('audio');
                    audioElement.style.display = 'none';
                    const playerContainer = document.querySelector('.custom-player');
                    playerContainer.appendChild(audioElement);
                    
                    // Update UI
                    updateSeekUI(position);
                    currentTime.textContent = formatTime(seekTime);
                    playButton.textContent = 'Play';
                    
                    // Set the current time for display purposes, but don't attempt playback
                    audioElement.currentTime = seekTime;
                    
                    // Keep track of which chunk we'd start from
                    currentChunkIndex = Math.floor(globalSeekTime * fileSize / CHUNK_SIZE);
                    
                    logMetric(`Seek to ${formatTime(seekTime)} - Press Play to start playback`);
                });

                
                audioElement.addEventListener('seeking', () => {
                    logMetric(`Browser seeking to ${formatTime(audioElement.currentTime)}...`);
                });
                
                audioElement.addEventListener('seeked', () => {
                    const seekDuration = Math.round(performance.now() - seekStartTime);
                    logMetric(`Seek completed in ${seekDuration}ms`);
                });
                
                // Play/Pause functionality
                playButton.addEventListener('click', function () {
                    if (audioElement.paused) {
                        // PLAY STATE - Starting playback from current position
                        //const seekTime = audioElement.currentTime;
                        const seekTime = globalSeekTime * fileDuration; // Use the global seek time
                        currentChunkIndex = Math.floor(globalSeekTime * fileSize / CHUNK_SIZE);
                        done = {}; // reset the done object

                        // Update UI initially
                        loadingIndicator.textContent = 'Loading audio chunk...';
                        loadingIndicator.style.display = 'block';
                        playButton.textContent = 'Stop';
                        
                        // DESTROY AND REBUILD EVERYTHING
                        // First, completely remove the old player infrastructure
                        destroyMediaPlayer();
                        
                        // Then, create a completely fresh player
                        createFreshMediaPlayer(seekTime);
                    } else {
                        // STOP STATE - Completely stop playback
                        const currentPos = audioElement.currentTime;
                        
                        // Just pause and update UI
                        audioElement.pause();
                        playButton.textContent = 'Play';
                        loadingIndicator.style.display = 'none';
                        
                        // Clear all buffers and state
                        chunksQueue.length = 0;
                        isPlayingCurrentChunk = false;
                        
                        logToSection('player', 'Playback stopped', 'info');
                        logMetric(`Playback stopped at ${formatTime(currentPos)}`);
                    }
                });

                function destroyMediaPlayer() {
                    // Abort all active requests
                    activeRequests.forEach(req => {
                        try {
                            req.controller.abort();
                        } catch (e) {
                            console.error('Error aborting request:', e);
                        }
                    });
                    activeRequests = [];

                    // Stop any ongoing playback
                    if (audioElement && !audioElement.paused) {
                        audioElement.pause();
                    }

                    // Remove all event listeners from the audio element
                    const oldEvents = ['canplay', 'seeking', 'seeked', 'canplaythrough', 'pause', 'play', 
                                    'ended', 'loadedmetadata', 'durationchange', 'timeupdate', 'error'];
                    oldEvents.forEach(event => {
                        audioElement.removeEventListener(event, audioElement[`on${event}`]);
                        audioElement[`on${event}`] = null;
                    });

                    // Clean up MediaSource resources
                    if (sourceBuffer) {
                        try {
                            sourceBuffer.abort();
                            sourceBuffer.removeEventListener('updateend', sourceBuffer.onupdateend);
                            sourceBuffer = null;
                        } catch (e) {
                            console.error('Error cleaning up sourceBuffer:', e);
                        }
                    }

                    if (mediaSource) {
                        try {
                            mediaSource.endOfStream();
                            mediaSource.removeEventListener('sourceopen', mediaSource.onsourceopen);
                            mediaSource = null;
                        } catch (e) {
                            console.error('Error cleaning up mediaSource:', e);
                        }
                    }

                    // Reset state variables
                    chunksQueue.length = 0;
                    loadedRanges.length = 0;
                    bytesLoaded = 0;
                    //currentChunkIndex = 0;
                    isPlayingCurrentChunk = false;

                    // Replace the audio element to ensure no lingering state
                    const oldAudio = audioElement;
                    const parent = oldAudio.parentNode;
                    audioElement = document.createElement('audio');
                    audioElement.style.display = 'none';
                    parent.replaceChild(audioElement, oldAudio);

                    logMetric('Media player completely destroyed and recreated');
                }
                
                function createFreshMediaPlayer(startTime) {
                    // Update UI
                    loadingIndicator.textContent = 'Creating fresh media player...';
                    
                    // Create fresh MediaSource
                    mediaSource = new MediaSource();
                    audioElement.src = URL.createObjectURL(mediaSource);
                    
                    // Store the absolute timeline position for UI and chunk selection
                    const absolutePosition = startTime;
                    
                    // Set up source open handler with clear ownership
                    const sourceOpenHandler = function() {
                        // Remove self to ensure we only run once
                        mediaSource.removeEventListener('sourceopen', sourceOpenHandler);
                        
                        try {
                            // Create source buffer
                            sourceBuffer = mediaSource.addSourceBuffer(mimeType);
                            
                            // Set duration to match the file's total duration
                            mediaSource.duration = fileDuration;
                            
                            // Only attempt to set mode if it's likely to be supported
                            if ('mode' in sourceBuffer && !mimeType.includes('audio/mpeg')) {
                                try {
                                    sourceBuffer.mode = 'segments';
                                    logMetric('Source buffer mode set to segments');
                                } catch (modeError) {
                                    logMetric(`Note: This format uses generated timestamps, continuing with default mode`);
                                }
                            }
                            
                            // Set up update handler with proper binding
                            sourceBuffer.addEventListener('updateend', function updateEndHandler() {
                                if (chunksQueue.length > 0 && !sourceBuffer.updating) {
                                    try {
                                        sourceBuffer.appendBuffer(chunksQueue.shift());
                                    } catch (e) {
                                        console.error('Error in updateend handler:', e);
                                    }
                                }
                            });
                            
                            // Set up all event listeners from scratch
                            setupAudioElementEventListeners();
                            
                            // Calculate which chunk to load based on the absolute position
                            const currentPos = absolutePosition / fileDuration;
                            currentChunkIndex = Math.floor(globalSeekTime * fileSize / CHUNK_SIZE);
                            isPlayingCurrentChunk = true;
                            
                            // Calculate chunk boundaries 
                            const chunkStart = currentChunkIndex * CHUNK_SIZE;
                            const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, fileSize - 1);
                            
                            logMetric(`Loading chunk for position ${formatTime(absolutePosition)}`);
                            
                            // Load chunk and start playback as a sequence of discrete steps
                            loadChunk(chunkStart, chunkEnd, currentChunkIndex)
                                .then(() => {
                                    // Wait for buffer update to complete
                                    if (sourceBuffer.updating) {
                                        return new Promise(resolve => {
                                            const handler = () => {
                                                sourceBuffer.removeEventListener('updateend', handler);
                                                resolve();
                                            };
                                            sourceBuffer.addEventListener('updateend', handler);
                                        });
                                    }
                                    return Promise.resolve();
                                })
                                .then(() => {
                                    // Always set the audio element's current time to 0
                                    // This is crucial - we're starting from the beginning of our chunk
                                    audioElement.currentTime = 0;
                                    
                                    // But update the UI to show the absolute position
                                    updateSeekUI(currentPos);
                                    currentTime.textContent = formatTime(absolutePosition);
                                    
                                    return new Promise(resolve => setTimeout(resolve, 100));
                                })
                                .then(() => {
                                    // Start playback
                                    logMetric(`Starting playback at absolute position ${formatTime(absolutePosition)}`);
                                    return audioElement.play();
                                })
                                .then(() => {
                                    // Update UI on successful play
                                    loadingIndicator.style.display = 'none';
                                    logToSection('player', 'Playback started', 'info');
                                    
                                    // Start UI updates that will show the correct absolute position
                                    startAbsoluteTimelineUpdates(absolutePosition);
                                })
                                .catch(error => {
                                    console.error('Playback initialization failed:', error);
                                    loadingIndicator.textContent = `Playback failed: ${error.message || 'Unknown error'}`;
                                    playButton.textContent = 'Play';
                                });
                        } catch (error) {
                            console.error('Error creating media player:', error);
                            logMetric(`Creation error: ${error.message}`);
                            loadingIndicator.textContent = `Error: ${error.message}`;
                            playButton.textContent = 'Play';
                        }
                    };
                    
                    // Register the handler
                    mediaSource.addEventListener('sourceopen', sourceOpenHandler);
                }

                audioElement.addEventListener('canplaythrough', function() {
                    logMetric('Buffer ready for continuous playback');
                    loadingIndicator.style.display = 'none';
                });
                
                // Stop functionality
                resetButton.addEventListener('click', function() {
                    // Pause audio
                    audioElement.pause();
                    
                    // Reset to beginning
                    audioElement.currentTime = 0;
                    
                    // Clear all chunks and buffers
                    chunksQueue.length = 0;
                    loadedRanges.length = 0;
                    bytesLoaded = 0;
                    currentChunkIndex = 0;
                    isPlayingCurrentChunk = false;
                    
                    // Update UI
                    playButton.textContent = 'Play';
                    updateSeekUI(0);
                    currentTime.textContent = '0:00';
                    
                    logToSection('player', 'Playback reset to beginning', 'info');
                    logMetric('All chunks cleared, player reset');
                });

                // Update UI during playback
                function updatePlaybackUI() {
                    // No longer need this since we're using our custom absoluteTimelineUpdates
                    // Using requestAnimationFrame just to check if playback is still working
                    if (!audioElement || audioElement.paused) {
                        return;
                    }
                    
                    try {
                        // Just check if the audio element's time is advancing
                        // We don't use this value for UI updates anymore
                        if (!audioElement._lastInternalTime) {
                            audioElement._lastInternalTime = audioElement.currentTime;
                            audioElement._stuckCounter = 0;
                            audioElement._stuckTime = performance.now();
                        } else if (audioElement._lastInternalTime === audioElement.currentTime) {
                            audioElement._stuckCounter++;
                            
                            // If stuck for more than 3 seconds
                            if (audioElement._stuckCounter > 180) {
                                const stuckDuration = Math.round((performance.now() - audioElement._stuckTime) / 1000);
                                logMetric(`Playback appears stuck for ${stuckDuration}s. Press Stop and Play again.`);
                                
                                audioElement._stuckCounter = 0; 
                                audioElement._stuckTime = performance.now();
                            }
                        } else {
                            // Time is advancing normally, reset counter
                            audioElement._lastInternalTime = audioElement.currentTime;
                            audioElement._stuckCounter = 0;
                            audioElement._stuckTime = performance.now();
                        }
                        
                        // Continue monitoring
                        requestAnimationFrame(updatePlaybackUI);
                    } catch (e) {
                        console.error("Error in updatePlaybackUI:", e);
                    }
                }
                

                audioElement.addEventListener('error', function(e) {
                    const errorMessage = e.target.error ? e.target.error.message : 'Unknown error';
                    console.error('Audio element error:', e.target.error);
                    logMetric(`Error: ${errorMessage}`);
                    loadingIndicator.textContent = `Error: ${errorMessage}`;
                });
                

                // Update seek UI elements
                function updateSeekUI(position) {
                    seekFill.style.width = `${position * 100}%`;
                    seekHandle.style.left = `${position * 100}%`;
                }
                
                // Helper for formatting file sizes
                function formatFileSize(bytes) {
                    if (bytes < 1024) return bytes + ' B';
                    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
                    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
                    else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
                }
                
                // Variable for seek timing
                let seekStartTime = 0;
            }
            
            
            audioPlayer.addEventListener('seeking', () => {
                seekStartTime = performance.now();
                logMetric(`Seeking to ${formatTime(audioPlayer.currentTime)}...`);
            });
            
            audioPlayer.addEventListener('seeked', () => {
                if (seekStartTime > 0) {
                    const duration = Math.round(performance.now() - seekStartTime);
                    logMetric(`Seek completed in ${duration} ms`);
                    seekStartTime = 0;
                }
            });
            
            // Helper function to format time
            function formatTime(seconds) {
                const mins = Math.floor(seconds / 60);
                const secs = Math.floor(seconds % 60);
                return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }
            
            // Helper function to log metrics
            function logMetric(message) {
                const entry = document.createElement('div');
                entry.textContent = message;
                entry.style.fontSize = '12px';
                
                const metricsDiv = document.getElementById('playerMetrics');
                metricsDiv.insertBefore(entry, metricsDiv.firstChild);
                
                // Keep only the last 5 entries
                while (metricsDiv.children.length > 5) {
                    metricsDiv.removeChild(metricsDiv.lastChild);
                }
            }
            
            // Original code continues below...
            // Fetch list of audio files -- do not forget basic auth
            fetch('/media/files', {
    method: 'GET',
    headers: {'auth-key': 'a93874791dd108864'}
})
            .then(response => response.json())
            .then(data => {
                if (data.files && data.files.length > 0) {
                    // Populate select dropdown with file size info
                    data.files.forEach(file => {
                        const option = document.createElement('option');
                        option.value = file.path;
                        option.textContent = `${file.name} (${file.sizeFormatted})`;
                        option.dataset.size = file.size;
                        audioSelect.appendChild(option);
                    });
                    
                    logToSection('player', `Loaded ${data.files.length} audio files`, 'info');
                } else {
                    logToSection('player', 'No audio files found', 'info');
                }
            })
            .catch(error => {
                logToSection('player', `Error loading audio files: ${error.message}`, 'error');
            });
            
            // traditional
            if ( 0) audioSelect.addEventListener('change', function() {
                if (this.value) {
                    // Set source for audio player
                    audioPlayer.src = `/media/stream?file=${encodeURIComponent(this.value)}`;
                    audioPlayer.load();
                    logToSection('player', `Selected file: ${this.options[this.selectedIndex].text}`, 'info');
                } else {
                    audioPlayer.src = '';
                    audioPlayer.load();
                }
            });
            audioPlayer.addEventListener('play', () => logToSection('player', 'Playback started', 'info'));
            audioPlayer.addEventListener('pause', () => logToSection('player', 'Playback paused', 'info'));
            audioPlayer.addEventListener('ended', () => logToSection('player', 'Playback finished', 'info'));
            audioPlayer.addEventListener('error', (e) => logToSection('player', `Playback error: ${e.message || 'Unknown error'}`, 'error'));
            
            // DiY
            if ( 1) audioSelect.addEventListener('change', function() {
                if (!this.value) {
                    // Clear player
                    const existingPlayer = document.querySelector('.custom-player');
                    if (existingPlayer) existingPlayer.remove();
                    return;
                }
                
                // Get file info with accurate duration before creating player
                fetch(`/media/fileinfo?file=${encodeURIComponent(this.value)}`, {
                    headers: {'auth-key': 'a93874791dd108864'}
                })
                .then(response => response.json())
                .then(fileInfo => {
                    logToSection('player', `Selected file: ${fileInfo.name} (${fileInfo.durationFormatted})`, 'info');
                    
                    // Create custom player with accurate duration info
                    createCustomStreamingPlayer(fileInfo.path, fileInfo.size, fileInfo.duration);
                })
                .catch(error => {
                    logToSection('player', `Error getting file info: ${error.message}`, 'error');
                });
            });
            
            // 
        }
        // Initialize media player when page loads
        document.addEventListener('DOMContentLoaded', function() {
            initializeMediaPlayer();
        });
