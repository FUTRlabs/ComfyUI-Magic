# ComfyUI-Magic: 🔋Batteries🔋 included 

Preview: 

[![asciicast](https://asciinema.org/a/621943.svg)](https://asciinema.org/a/621943)

## Quick Start

1. Update your NVIDIA Drivers (only NVIDIA cards supported right now)
2. Install Docker and NVIDIA's container toolkit (Windows: Install WSL, then install Docker Desktop)
3. Run the following command if all you want is a ComfyUI: 

```
docker run --name comfyui-magic -p 8188:8188 --gpus all -it --rm -v magic:/storage comfyui-magic:latest
```

## Earn USDC and FUTR

If you'd like to earn money while your GPU isn't processing ComfyUI workflows, sign up here and run the command provided:

[https://www.minethefutr.com](https://www.minethefutr.com)


## Features

### Prepackaged Custom Nodes for Your Sanity

Currently, we automatically bake in stable mixtures of these popular custom nodes:

- https://github.com/ltdrdata/ComfyUI-Inspire-Pack.git
- https://github.com/ltdrdata/ComfyUI-Impact-Pack.git 
- https://github.com/cubiq/ComfyUI_IPAdapter_plus.git 
- https://github.com/storyicon/comfyui_segment_anything.git 
- https://github.com/Gourieff/comfyui-reactor-node.git  
- https://github.com/WASasquatch/was-node-suite-comfyui.git 
- https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git
- https://github.com/RockOfFire/ComfyUI_Comfyroll_CustomNodes.git
- https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet
- https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite
- https://github.com/Fannovel16/comfyui_controlnet_aux
- https://github.com/jags111/efficiency-nodes-comfyui
- https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git

### Automatic downloading of models at boot

We place a sample "extra_downloads.yml" file in your storage directory. 

Edit that file to download and place any custom models you'd like to have, then restart the container and watch the magic.

See this file for our default models we download at boot: [extra_downloads.yml](extra_downloads.yml)

To add your own models, take note that the `path` item in the yml is the path inside the container. 

All paths should generally use `/storage/ComfyUI/.../...` unless you have very good reason not to.

Once the file is placed for the first time in your storage directory, it won't be overwritten again.

### Earn USDC and FUTR tokens when idle

Your card is mostly idle all day. There are large websites that would like to use your GPU horsepower and will pay to do it.

While your job is not in the queue, a simple script talks to our queues and pulls jobs. 

You'll see these jobs enter your ComfyUI queue if you've got the UI open in your browser.

When you're ready to run your own job on your own card, just queue it up like you normally would in ComfyUI, 

and it will execute after the currently running job that is earning you money.

If you ever want to not process jobs for a while, simply stop the container, remove the environment variable (-e SUPPLIER_ID), and start the container back up!

### Requirements:

1. Windows or Linux Operating System (Mac unsupported for now)
2. NVIDIA GPU of series 2xxx or better (ideally)
3. Updated CUDA drivers (update your graphics drivers)
4. Docker installed and working with NVIDIA container support (Use WSL and Docker Desktop for Windows!)
5. 50-100GB+ of HDD space (roughly 10GB for the default models and 8GB for the container alone)
6. Solana Wallet and Discord if you want to earn
