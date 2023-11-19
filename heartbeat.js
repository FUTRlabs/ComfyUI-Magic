const { exec } = require('child_process');
const { spawn } = require('child_process');

const fs = require('fs');

const axios = require('axios');
const FormData = require('form-data');

const Queue = require('bull');

const path = require('path');

require('dotenv').config();

const Redis = require("ioredis");

const production = true;


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
  const gpuStats = await getGpuInfo();

  const defaultRoute = await getDefaultRoute();

  const response = await axios.get(`http://${defaultRoute}/register/${supplierID}?gpuStats=${gpuStats}`);

  if (response.data && response.data.ok === false) {
    throw new Error("The supplier registration failed. Please verify the SUPPLIER_ID has been provided via docker environment variables.");
  } else {
    console.log("Registration succeeded.");
  }
}


async function mainLoop() {
  await waitForComfy();
  try {
    await register();
  } catch(error) {};

  const defaultRoute = await getDefaultRoute();
  const connectionString = `redis://${supplierID}:@${defaultRoute.split(":")[0]}:6379`;
  const supplierQueue = new Queue("supplierQueue", connectionString);

  supplierQueue.on("error", async function(error) {
    console.log(error);
    try {
      await register();
    } catch(error) {}
  });

  var manualRedis = new Redis(connectionString, {
    reconnectOnError: function(err) {
      console.log("FUTR: ERROR CONNECTING TO QUEUE");
      console.log(err.message);

      return axios.get(`http://${defaultRoute}/register/${supplierID}`).then( () => {
       return true; 
      });
    },
    //enableReadyCheck: false
  });

  try { 
    axios.get(`http://${defaultRoute}/register/${supplierID}`)

    console.log("Connecting to Queue...");

    await supplierQueue.process(async function (job, done) {
      console.log(`Caught a job: ${job.id}`);
      const workflow = job.data.workflow;

      Object.keys(workflow).forEach((key) => {
        const obj = workflow[key];
        if (obj.class_type === "SaveImage") {
          obj.inputs.filename_prefix = "futr_" + job.id + "_";
        }
      });

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
        const outputPath = '/storage/ComfyUI/output'; // replace with your folder path

        //TODO: Watch for more than one file?
        const filePath =  `${outputPath}/futr_${job.id}__00001_.png`;

        var lastFileSizeInBytes = 0;
        var sameReadingCount = 0;

        var gpuReadings = [];

        while(true) {
          // Check if the file exists
          if (fs.existsSync(filePath)) {

            // Get the stats of the file
            const stats = fs.statSync(filePath);
            const fileSizeInBytes = stats.size;

            // Record the new last filesize
            if(fileSizeInBytes > 0) {

              if(lastFileSizeInBytes != fileSizeInBytes) {
                lastFileSizeInBytes = fileSizeInBytes;
                //reset the reading count
                sameReadingCount = 0;
              } else {
                sameReadingCount += 1;
              }

            }

            //Break out of the loop if we've found our file.
            if(sameReadingCount > 5) {
              break;
            }

          } else {
            //console.log('File does not exist.');
          }

          try {
            var gpuResults = await getGpuInfo();
            gpuReadings.push(gpuResults);
          } catch (error) {
            console.log("Cannot retrieve GPU Readings.");
            console.log(error);
          }

          await sleep(50);
        } //while

        try {
          // Read the file content
          const fileStream = fs.createReadStream(filePath);

          const filename = path.basename(filePath);

          const fileKey = `output/${job.id}_${filename}`;

          const result = await uploadToS3("futr-workflows", fileKey, fileStream);

          const finalUrl = `https://futr-workflows.s3.us-east-2.amazonaws.com/${fileKey}`;

          //TODO: Support multiple images!

          console.log(`Job completed and uploaded: ${finalUrl}`);

          done(null, {images: [finalUrl,], supplier_id: supplierID, gpu_stats: gpuReadings});
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
let logs = [];

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
  console.log(logLine); // Print the log line
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
      console.log(error);
    }
  }
})();
