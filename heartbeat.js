const { exec } = require('child_process');
const { spawn } = require('child_process');

const fs = require('fs');

const axios = require('axios');
const FormData = require('form-data');

const Queue = require('bull');

const path = require('path');

require('dotenv').config();

const Redis = require("ioredis");

console.log(process.env);
console.log("PRODUCTION var:");
console.log(process.env.PRODUCTION);

var production = true;

if(process.env.PRODUCTION === 'false') {
  production = false;
} 


let logs = [];

const {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  DeleteBucketCommand,
  paginateListObjectsV2,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");


const { fromEnv } = require("@aws-sdk/credential-providers");

const s3Client = new S3Client({region: "us-east-2", credentials: fromEnv()});

// Helper function to upload content to S3
async function uploadToS3(bucketName, key, buffer) {
  return s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
    })
  );
}


const supplierID = process.env.SUPPLIER_ID;

if(supplierID == null) {
  console.log("YOU MUST PROVIDE A SUPPLIER_ID TO PARTICIPATE IN MINETHEFUTR.COM.");
}

// Get the default IP of the host for developers to run the queue and this locally
const getDefaultRoute = async () => {
  return new Promise((resolve, reject) => {
    if(!production) {
      exec("/sbin/ip route|awk '/default/ { print $3 }'", (error, stdout, stderr) => {
        if (error) {
          return reject(error);
        }
        if (stderr) {
          return reject(new Error(stderr));
        }
        resolve(stdout.trim() + ":3000");
      });
    } else {
      resolve("queue.minethefutr.com:3000");
    }
  });
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForComfy() {
    const url = 'http://0.0.0.0:8188';

    while (true) {
        try {
            const response = await axios.get(url);
            if (response.status === 200) {
                console.log('Received 200 OK - COMFYUI READY');
                break;
            }
        } catch (error) {
            console.error('Error or non-200 response, retrying...');
        }

        // Wait for a short period before retrying (e.g., 5 seconds)
        await sleep(5000);
    }
}

async function register() {
  try {
    const gpuStats = await getGpuInfo();

    const defaultRoute = await getDefaultRoute();

    const response = await axios.get(`http://${defaultRoute}/register/${supplierID}?gpuStats=${gpuStats}`);

    if (response.data && response.data.ok === false) {
      throw new Error("The supplier registration failed. Please verify the SUPPLIER_ID has been provided via docker environment variables.");
    } else {
      console.log("Registration succeeded.");
    }
  } catch (error) {
    console.log("Registration error:");
    console.log(error);
  }
}

async function processFiles(directoryPath, prefix, jobId) {
  try {
    const files = fs.readdirSync(directoryPath);
    const filteredFiles = files.filter(file => file.startsWith(prefix));

    const uploadPromises = filteredFiles.map(async (filename) => {
      const filePath = path.join(directoryPath, filename);
      const fileStream = fs.createReadStream(filePath);

      const fileKey = `output/${jobId}_${filename}`;
      await uploadToS3("futr-workflows", fileKey, fileStream);

      return `https://futr-workflows.s3.us-east-2.amazonaws.com/${fileKey}`;
    });

    const finalUrls = await Promise.all(uploadPromises);
    return finalUrls;
  } catch (error) {
    console.error('Error processing files:', error);
    throw error;
  }
}


async function mainLoop() {
  await waitForComfy();
  await register();

  const defaultRoute = await getDefaultRoute();
  const connectionString = `redis://${supplierID}:@${defaultRoute.split(":")[0]}:6379`;
  const supplierQueue = new Queue("supplierQueue", connectionString);

  supplierQueue.on("error", async function(error) {
    await register();
    console.log("SUPPLIER QUEUE ERROR:");
    console.log(error);
  });

  try { 
    console.log("Connecting to Queue...");

    await supplierQueue.process(async function (job, done) {
      console.log(`Caught a job: ${job.id}`);
      const workflow = job.data.workflow;

      Object.keys(workflow).forEach((key) => {
        const obj = workflow[key];

        if (obj.class_type === "SaveImage" || obj.class_type === "Save Image" || obj.class_type === "VHS_VideoCombine") {
          obj.inputs.filename_prefix = "futr_" + job.id + "_";
        }
      });

      console.log(workflow);

      const consumer_id = job.data.owner_key;

      const sendPrompt = await axios.post("http://localhost:8188/prompt", JSON.stringify({"prompt": workflow}), {
        headers: {
          'Content-Type': 'application/json'
        }
      }).catch(
        function (error) {
          console.log("COMFY ERROR PROCESSING WORKFLOW:",error)
          done(new Error("COMFY WORKFLOW ERROR:\n\n" + getLast100LogLines()));
          return null;
        }
      ) 

      if(sendPrompt) {
        logs = [];
        var gpuReadings = [];
        gpuReadings.push(await getGpuInfo());
        console.log("Waiting for job to complete...");
        var pauseFor = 1000;

        while(true) {
          if(logs.join(" ").includes("Prompt executed in")) {
            break; 
          }

          if(logs.join(" ").includes("Exception during processing")) {
            done(new Error("COMFY WORKFLOW ERROR:\n\n" + getLast100LogLines()));
          }

          try {
            var gpuResults = await getGpuInfo();
            gpuReadings.push(gpuResults);
          } catch (error) {
            console.log("Cannot retrieve GPU Readings.");
            console.log(error);
          }

          await sleep(pauseFor);
        }

        const directoryPath = '/storage/ComfyUI/output'; 
        const prefix = `futr_${job.id}__`; // Replace with your desired prefix

        try {
          var outputURLs = await processFiles(directoryPath, prefix, job.id);

          console.log(`Job ${job.id} completed and uploaded: ${outputURLs.join(",")}`);

          done(null, {images: outputURLs, supplier_id: supplierID, gpu_stats: gpuReadings});
        } catch (readError) {
          console.error("Error:", readError);
        }
      }

    }); //queue.process
  } catch(connectError) {
    console.log(`COULD NOT CONNECT TO QUEUE... Trying again in 5 seconds...`);
  } 
};


function getGpuInfo() {
  return new Promise((resolve, reject) => {
    exec('nvidia-smi --query-gpu=timestamp,driver_version,name,memory.total,memory.used,memory.free,pstate,power.draw,power.limit --format=csv,noheader', (error, stdout, stderr) => {
      if (error) {
        console.log('Error fetching GPU info:');
        console.log(stderr);
        reject(new Error('Failed to fetch GPU info'));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Function to fetch Python information
function getPythonInfo(callback) {
  exec('python --version', (error, stdout, stderr) => {
    if (error) {
      console.error('Error fetching Python version:', stderr);
      callback(null);
    } else {
      const version = stdout || stderr; // python --version writes to stderr
      exec('pip list --format=json', (pipError, pipStdout, pipStderr) => {
        if (pipError) {
          console.error('Error fetching pip list:', pipStderr);
          callback(version.trim(), null);
        } else {
          const libraries = JSON.parse(pipStdout);
          callback(version.trim(), libraries);
        }
      });
    }
  });
}

let comfyUiProcess;

function startComfyUi() {
  comfyUiProcess = spawn('python', ['/storage/ComfyUI/main.py', '--listen', '0.0.0.0', '--extra-model-paths-config', '/extra_model_paths.yml']);

  comfyUiProcess.stdout.on('data', (data) => {
    processLog(data);
  });

  comfyUiProcess.stderr.on('data', (data) => {
    processLog(data);
  });

  comfyUiProcess.on('close', (code) => {
    console.log(`ComfyUI process exited with code ${code}`);
    startComfyUi(); // Restart ComfyUI
  });
}

function processLog(data) {
  const logLine = data.toString();
  console.log("COMFY: " + logLine); // Print the log line
  logs.push(logLine);
  if (logs.length > 100) {
    logs.shift(); // Remove the oldest log line if more than 100 lines are stored
  }
}

function getLast100LogLines() {
  return logs.join('\n');
}

startComfyUi();

(async function main() {
  while(true) {
    try {
      await mainLoop();
    } catch(error) {
      console.log("Main Loop Error");
      console.log(error);
    }
  }
})();
