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
#COPY ./src/HiFiFace-pytorch /workspace/src/HiFiFace-pytorch

RUN git clone https://github.com/comfyanonymous/ComfyUI.git /workspace/ComfyUI && cd ComfyUI && git reset --hard 777f6b15225197898a5f49742682a2be859072d7
RUN git clone https://github.com/ltdrdata/ComfyUI-Manager.git /workspace/ComfyUI/custom_nodes/ComfyUI-Manager


WORKDIR /workspace
RUN cd /workspace/ComfyUI && pip install -r requirements.txt
RUN cd /workspace/ComfyUI/custom_nodes/ComfyUI-Manager && pip install -r requirements.txt

WORKDIR /workspace/ComfyUI/custom_nodes
RUN git clone https://github.com/ltdrdata/ComfyUI-Inspire-Pack.git && cd ComfyUI-Inspire-Pack && git reset --hard c380f3c7d554940f9a01f701d2b8f512b0346021 && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack.git && cd ComfyUI-Impact-Pack && git reset --hard b6dcea19d980f7ca36c2c6bee1b51e024a233d6b && ( pip install -r requirements.txt || true ) 
RUN git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git && cd ComfyUI_IPAdapter_plus && git reset --hard ee85b4cff6b274d5b2b58cbfcfdd57d5790d68de && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/storyicon/comfyui_segment_anything.git && cd comfyui_segment_anything && git reset --hard f2283d4e4207d4352dfa2fe00ee952dc4918e6ef && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Gourieff/comfyui-reactor-node.git && cd comfyui-reactor-node && git reset --hard 9404b14b8c1e35845967c9bd4455fcccd28705e6 && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/WASasquatch/was-node-suite-comfyui.git && cd was-node-suite-comfyui && git reset --hard 4e53775e650a7e2d2d1d73056bb914d7edc57f69 && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git && cd ComfyUI-Custom-Scripts && git reset --hard 27555d4f71bb4e24b87571f89eab2b4a06677bb6 && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/RockOfFire/ComfyUI_Comfyroll_CustomNodes.git && cd ComfyUI_Comfyroll_CustomNodes && git reset --hard 11abadd037ab87a37ab4dc208f552515312c5278 && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet && cd ComfyUI-Advanced-ControlNet && git reset --hard b5e77ecc3f8cd274f13996bf05816c601d90006f && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite && cd ComfyUI-VideoHelperSuite && git reset --hard 0592867fa6ade998e5930aac6f508084184229a1 && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Fannovel16/comfyui_controlnet_aux && cd comfyui_controlnet_aux && git reset --hard 58ce1e01ebb13a38f6f3ab32a31bd3beb065e0d8 && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/jags111/efficiency-nodes-comfyui && cd efficiency-nodes-comfyui && git reset --hard 8cae155233444c9f16172389dedbe38d386f1b15 && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git && cd ComfyUI-AnimateDiff-Evolved && git reset --hard 203313e1ea52c2c76d38dbaaf5790d56eb601ebb && ( pip install -r requirements.txt || true )
RUN git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git && cd ComfyUI-Frame-Interpolation && git reset --hard 4f60bf5c04149b3158b8739aff27bdafd5ac9703 && ( python install.py || true )
RUN git clone https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git --recursive && cd ComfyUI_UltimateSDUpscale && git reset --hard 6ea48202a76ccf5904ddfa85f826efa80dd50520 
RUN git clone https://github.com/mav-rik/facerestore_cf.git && cd facerestore_cf && git reset --hard 2b5d727ed658e0b3feb14a620d67dad1b1bcb0ab && ( pip install -r requirements.txt || true )
COPY ./h264-discord.json /workspace/ComfyUI/custom_nodes/ComfyUI-VideoHelperSuite/video_formats/h264-discord.json

RUN mkdir -p /workspace/ComfyUI/models/facerestore_models/ && wget -nc -O /workspace/ComfyUI/models/facerestore_models/codeformer.pth https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth
#RUN wget -nc -O /workspace/ComfyUI/models/facerestore_models/GFPGANv1.4.pth  https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth

# Cached prior to deletion
RUN mkdir -p /workspace/ComfyUI/models/insightface/ 
COPY ./models/inswapper_128.onnx /workspace/ComfyUI/models/insightface/inswapper_128.onnx

# Add Tini
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
RUN echo '0.3.0' > /version

RUN pip install openai==0.28 numexpr

CMD ["/bin/magic"]
