# diyaudio

## install

### Docker container

We use ffmpeg on server side, so we need to create a custom nodejs (18) container with ffmpeg in it.  Use `Dockerfile` to build the image.

### install packages before running and run

install packages
```
docker run --rm -it --workdir /app -p 8003:8003 -v /add/diyaudio:/app diyaudio
ents npm install express body-parser cors
...
added 132 packages, and audited 133 packages in 11s

24 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
....

```

and run:
```
docker run --rm -it --workdir /app -p 8003:8003 -v /add/diyaudio:/app diyaudio
ents node manager.js
...
Server running on port 8003
```


### Run front

Traditional vs DiY player switch: 
 - in `client.js` find Traditional and DiY comments and change IF conditions to switch between the two.
 - provide your own media files, not part of the source code
   - note that only MP3 files are supported in DiY mode




