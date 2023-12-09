FROM pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime

RUN apt update -y
RUN DEBIAN_FRONTEND=noninteractive TZ=America/Chicago apt install -y sudo build-essential iproute2 wget ncurses-bin figlet toilet vim nano tig curl git htop zsh ffmpeg tmux jq ca-certificates gnupg

RUN mkdir -p /etc/apt/keyrings

RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list

RUN apt update 
RUN apt install -y nodejs 

RUN cd /root && npm install request chokidar form-data ws glob express axios @aws-sdk/client-s3 @aws-sdk/credential-providers dotenv bull

RUN pip install gradio opencv-python kornia loguru scikit-image onnx onnxruntime-gpu lpips ultralytics python_bidi arabic_reshaper 
RUN pip install torchvision gitpython timm addict yapf insightface numba

RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
COPY ./.zshrc /root/.zshrc

WORKDIR  /workspace/

RUN git clone https://github.com/comfyanonymous/ComfyUI.git /workspace/ComfyUI && cd ComfyUI && git reset --hard 777f6b15225197898a5f49742682a2be859072d7
RUN git clone https://github.com/ltdrdata/ComfyUI-Manager.git /workspace/ComfyUI/custom_nodes/ComfyUI-Manager


WORKDIR /workspace
RUN cd /workspace/ComfyUI && pip install -r requirements.txt
RUN cd /workspace/ComfyUI/custom_nodes/ComfyUI-Manager && pip install -r requirements.txt

WORKDIR /workspace/ComfyUI/custom_nodes
RUN git clone https://github.com/ltdrdata/ComfyUI-Inspire-Pack.git && cd ComfyUI-Inspire-Pack && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack.git && cd ComfyUI-Impact-Pack && ( pip install -r requirements.txt || true ) 
RUN git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git && cd ComfyUI_IPAdapter_plus && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/storyicon/comfyui_segment_anything.git && cd comfyui_segment_anything && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Gourieff/comfyui-reactor-node.git && cd comfyui-reactor-node && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/WASasquatch/was-node-suite-comfyui.git && cd was-node-suite-comfyui && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git && cd ComfyUI-Custom-Scripts && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/RockOfFire/ComfyUI_Comfyroll_CustomNodes.git && cd ComfyUI_Comfyroll_CustomNodes && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet && cd ComfyUI-Advanced-ControlNet && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite && cd ComfyUI-VideoHelperSuite && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Fannovel16/comfyui_controlnet_aux && cd comfyui_controlnet_aux && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/jags111/efficiency-nodes-comfyui && cd efficiency-nodes-comfyui && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git && cd ComfyUI-AnimateDiff-Evolved && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git && cd ComfyUI-Frame-Interpolation && ( python install.py || true )
RUN git clone https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git --recursive 
RUN git clone https://github.com/mav-rik/facerestore_cf.git && cd facerestore_cf && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/ManglerFTW/ComfyI2I.git && cd ComfyI2I && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/BadCafeCode/masquerade-nodes-comfyui.git 
COPY ./h264-discord.json /workspace/ComfyUI/custom_nodes/ComfyUI-VideoHelperSuite/video_formats/h264-discord.json

RUN mkdir -p /workspace/ComfyUI/models/facerestore_models/ && wget -nc -O /workspace/ComfyUI/models/facerestore_models/codeformer.pth https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth

RUN mkdir -p /workspace/ComfyUI/models/insightface/ 
COPY ./models/inswapper_128.onnx /workspace/ComfyUI/models/insightface/inswapper_128.onnx
COPY ./models/1x_ArtClarity.pth /workspace/ComfyUI/models/upscale_models/1x_ArtClarity.pth
COPY ./models/4xLSDIRCompactv2.pth /workspace/ComfyUI/models/upscale_models/4xLSDIRCompactv2.pth
COPY ./models/4x-Rybu.pth /workspace/ComfyUI/models/upscale_models/4x-Rybu.pth
COPY ./models/4xPSNR.pth /workspace/ComfyUI/models/upscale_models/4xPSNR.pth

COPY ./models/embeddings/* /workspace/ComfyUI/models/embeddings/
RUN mkdir -p /workspace/ComfyUI/input/negatives
COPY ./negative_prompts/* /workspace/ComfyUI/input/negatives/

ENV TINI_VERSION v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini
ENTRYPOINT ["/tini", "--"]

RUN wget https://github.com/mikefarah/yq/releases/download/v4.35.2/yq_linux_amd64 -O /usr/bin/yq && chmod +x /usr/bin/yq

COPY ./extra_model_paths.yml /extra_model_paths.yml
COPY ./extra_downloads.yml /extra_downloads.yml

COPY ./magic /bin/magic
COPY ./.env /root/.env
COPY ./heartbeat.js /root/heartbeat.js

RUN mv /opt/conda/bin/ffmpeg /opt/conda/bin/ffmpeg-ancient
RUN ln -s /usr/bin/ffmpeg /opt/conda/bin/ffmpeg
WORKDIR /storage/ComfyUI
RUN echo '0.3.4' > /version

RUN pip install openai==0.28 numexpr

CMD ["/bin/magic"]
