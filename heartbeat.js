const { exec } = require('child_process');
const { spawn } = require('child_process');

const fs = require('fs');

const axios = require('axios');
const FormData = require('form-data');

const Queue = require('bull');

const path = require('path');

require('dotenv').config();

const Redis = require("ioredis");

var production = true;

if(process.env.PRODUCTION === 'false') {
  production = false;
} 

const versionFilePath = '/version';
const expectedVersion = '0.3.0';

function outOfDate() {
  console.log("YOUR CONTAINER IS OUT OF DATE. STOP THIS CONTAINER AND THEN RUN: ");
  console.log("docker pull futrlabsmagic/comfyui-magic:latest");
  process.exit(1);  
}

if( fs.existsSync(versionFilePath) ) {
  const versionContents = fs.readFileSync(versionFilePath, 'utf8').trim();
  console.log(`Container version: ${versionContents} == ${expectedVersion}`) 
  if(versionContents != expectedVersion) {
    outOfDate();
  } else {
    console.log("Up to date! v" + expectedVersion);
  }
} else {
  outOfDate();
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

      try {
        console.log("Deleting file.");
        fs.unlinkSync(filePath);
      } catch(err) {
        console.log("Error deleting file:");
        console.log(err);
      }

      return `https://futr-workflows.s3.us-east-2.amazonaws.com/${fileKey}`;
    });

    const finalUrls = await Promise.all(uploadPromises);
    return finalUrls;
  } catch (error) {
    console.error('Error processing files:', error);
    throw error;
  }
}

function getVRAMQueueBuckets(gpuJSON) {
  const gpuData = JSON.parse(gpuJSON);
  // Extract total memory and convert to GB
  const totalMemoryMiB = parseInt(gpuData.memory.total);
  const totalMemoryGB = Math.ceil(totalMemoryMiB / 1024); // Convert MiB to GB and round up

  // Determine VRAM bucket
  let vramBuckets = [];
  if (totalMemoryGB <= 2) {
    vramBuckets = ['2GB_VRAM'];
  } else if (totalMemoryGB <= 4) {
    vramBuckets = ['2GB_VRAM', '4GB_VRAM'];
  } else if (totalMemoryGB <= 6) {
    vramBuckets = ['2GB_VRAM', '4GB_VRAM', '6GB_VRAM'];
  } else if (totalMemoryGB <= 8) {
    vramBuckets = ['2GB_VRAM', '4GB_VRAM', '6GB_VRAM','8GB_VRAM'];
  } else if (totalMemoryGB <= 12) {
    vramBuckets = ['2GB_VRAM', '4GB_VRAM', '6GB_VRAM','8GB_VRAM', '12GB_VRAM'];
  } else {
    vramBuckets = ['2GB_VRAM', '4GB_VRAM', '6GB_VRAM','8GB_VRAM', '12GB_VRAM','16GB_VRAM'];
  }

  return vramBuckets;
}

var queues = { };
var pausing = false;
var resuming = false;

async function pauseAllQueues() {
  if(!pausing) {
    pausing = true;
    console.log("Pausing all queues.");
    var promises = [];

    Object.values(queues).forEach(async queue => {
      promises.push(queue.pause(true, true));
    });

    await Promise.all(promises);
    console.log("queues paused");
    pausing = false;
  }
}

async function resumeAllQueues() {
  if(!resuming) {
    resuming = true;
    console.log("Resuming all queues.");
    var promises = [];

    await Object.values(queues).forEach(async queue => {
      promises.push(queue.resume(true));
    });

    await Promise.all(promises);
    console.log("queues resumed.");
    resuming = false;
  }
}

async function processJob(job, done) {
  try { 
    console.log(`Caught a job: ${job.id}`);
    const workflow = job.data.workflow;
    await pauseAllQueues();

    Object.keys(workflow).forEach((key) => {
      const obj = workflow[key];

      if (obj.class_type === "SaveImage" || obj.class_type === "Save Image" || obj.class_type === "VHS_VideoCombine") {
        obj.inputs.filename_prefix = "futr_" + job.id + "_";
      }
    });

    const consumer_id = job.data.owner_key;

    const sendPrompt = await axios.post("http://localhost:8188/prompt", JSON.stringify({"prompt": workflow}), {
      headers: {
        'Content-Type': 'application/json'
      }
    }).catch(
      async function (error) {
        console.log("COMFY ERROR PROCESSING WORKFLOW:",error)
        done(new Error("COMFY WORKFLOW ERROR:\n\n" + getLast100LogLines()));
        await resumeAllQueues();
        return false;
      }
    ) 

    if(sendPrompt) {
      logs = [];
      var gpuReadings = [];
      gpuReadings.push(await getGpuInfo());
      console.log("Waiting for job to complete...");
      var pauseFor = 1000;

      while(true) {
        console.log("Waiting for job to complete...");
        if(logs.join(" ").includes("Exception during processing")) {
          done(new Error("COMFY WORKFLOW ERROR:\n\n" + getLast100LogLines()));
          await resumeAllQueues();
          return;
        }

        if(logs.join(" ").includes("Prompt executed in")) {
          break; 
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
      const prefix = `futr_${job.id}__`;

      try {
        var outputURLs = await processFiles(directoryPath, prefix, job.id);

        console.log(`Job ${job.id} completed and uploaded: ${outputURLs.join(",")}`);

        done(null, {images: outputURLs, supplier_id: supplierID, gpu_stats: gpuReadings});
      } catch (readError) {
        console.error("Error:", readError);
      }

    }
  } catch(connectError) {
    console.log(connectError);
    console.log(`COULD NOT CONNECT TO QUEUE... Trying again in 5 seconds...`);
  } 

  await resumeAllQueues();
  console.log("End of ProcessJob function.");
}

async function mainLoop() {
  console.log("Beginning main loop...");
  await waitForComfy();
  await register();

  const defaultRoute = await getDefaultRoute();
  const connectionString = `redis://${supplierID}:@${defaultRoute.split(":")[0]}:6379`;

  const vramBuckets = getVRAMQueueBuckets(await getGpuInfo());
  console.log(`VRAM BUCKETS: ${vramBuckets}`);

  var processPromises = [];
  vramBuckets.forEach(bucket => {
    queues[bucket] = new Queue(bucket, connectionString);
    queues[bucket].on("error", async function(error) {
      await register();
      console.log("SUPPLIER QUEUE ERROR:");
      console.log(error);
    });

    console.log("Pushing process function to promises for queue: " + bucket);
    processPromises.push(queues[bucket].process(processJob));

  });

  await Promise.all(processPromises);
  console.log("Main loop completed.");
};

function getGpuInfo() {
  return new Promise((resolve, reject) => {
    exec('nvidia-smi --query-gpu=timestamp,driver_version,name,memory.total,memory.used,memory.free,pstate,power.draw,power.limit --format=csv,noheader', (error, stdout, stderr) => {
      if (error) {
        console.log('Error fetching GPU info:');
        console.log(stderr);
        reject(new Error('Failed to fetch GPU info'));
      } else {
        const output = stdout.trim();
        // Split the string by comma and trim each part
        const parts = output.split(',').map(part => part.trim());

        // Construct the JSON object
        const gpuInfo = {
          timestamp: parts[0],
          driver_version: parts[1],
          name: parts[2],
          memory: {
            total: parts[3],
            used: parts[4],
            free: parts[5]
          },
          pstate: parts[6],
          power: {
            draw: parts[7],
            limit: parts[8]
          }
        };

        resolve(JSON.stringify(gpuInfo));
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
  comfyUiProcess = spawn('python', ['/storage/ComfyUI/main.py', '--listen', '0.0.0.0', '--extra-model-paths-config', '/extra_model_paths.yml', '--disable-xformers']);

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

function triggerRegister() {
  register()
    .then(function() {
      console.log(`${new Date().toISOString()} - Reported in to FUTR Queue successfully.`);
    })
    .catch(function(error) {
      console.log(error);
    });
}


setInterval(triggerRegister, 60000);

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
