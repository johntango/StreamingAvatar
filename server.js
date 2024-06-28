const express = require('express');
const OpenAI = require('openai')
const path = require('path');
const app = express();
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const {Readable} = require('stream');
const {toFile} = require("openai/uploads");

app.use(express.json());

let focus = { assistant_id: "", assistant_name: "", file_id: "", thread_id: "", message: "", func_name: "", run_id: "", status: "" };


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
console.log(`OPENAI_API_KEY  ${process.env.OPENAI_API_KEY} `);
const systemSetup = "you are a demo streaming avatar from HeyGen, an industry-leading AI generation product that specialize in AI avatars and videos.\nYou are here to showcase how a HeyGen streaming avatar looks and talks.\nPlease note you are not equipped with any specific expertise or industry knowledge yet, which is to be provided when deployed to a real customer's use case.\nAudience will try to have a conversation with you, please try answer the questions or respond their comments naturally, and concisely. - please try your best to response with short answers, limit to one sentence per response, and only answer the last question."

app.use(express.static(path.join(__dirname, '.')));

app.post('/openai/complete', async (req, res) => {
  try {
    const prompt = req.body.prompt;
    const chatCompletion = await openai.chat.completions.create({
      messages: [
        { role: 'system', content: systemSetup},
        { role: 'user', content: prompt }
      ],
      model: 'gpt-3.5-turbo',
    });
    res.json({ text: chatCompletion.choices[0].message.content });
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    res.status(500).send('Error processing your request');
  }
});

app.get('/newChat', async (req, res) => {
  let response = await switchThread();
  res.status(200).json(response);
});

app.post('/openai/completeJohn', async (req, res) => {
  let prompt = req.body.prompt;
  if(focus.thread_id == ""){
    await switchThread();
  }
  focus.assistant_id = "asst_118CkWzCFTyBBJuGTLNNwMBN"; // special agent 
  let message = await runAssistant(prompt);
  console.log(message);
  res.json({ text: message });
})

async function switchThread() {
  if (focus.thread_id =="") {
    focus.thread_id = "thread_IJtntsN037DFYZ4jKm2rWL7l";
  }else {
      // create a new thread
      let thread = await openai.beta.threads.create();
      focus.thread_id = thread.id;
  }
  return {text:focus.thread_id};
}


//
// this puts a message onto a thread and then runs the assistant 
async function runAssistant(prompt) {
  try {
      let thread_id = focus.thread_id;
      await openai.beta.threads.messages.create(thread_id,
          {
              role: "user",
              content: prompt,
          })
      let run = await openai.beta.threads.runs.create(thread_id, {
          assistant_id: focus.assistant_id
      })
      let run_id = run.id;
      focus.run_id = run_id;
      await get_run_status(thread_id, run_id); // blocks until run is completed
   
      // now retrieve the messages
      let response = await openai.beta.threads.messages.list(thread_id)

      let message = get_last_response(response.data);
      return message;

  }
  catch (error) {
      console.log(error);
      return error;
  }
}
function get_last_response(data) {
  let last_message = data[0].content[0].text.value;
  if (last_message) {
      return last_message;
  }
  // return last message pushed onto stack
  return "No response from assistant";
}
async function get_run_status(thread_id, run_id) {
  try {
      let response = await openai.beta.threads.runs.retrieve(thread_id, run_id)
      let message = response;
      focus.status = response.status;
      let tries = 0;
      while (response.status == 'in_progress'||response.static == "queued" && tries < 10) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for 1 second
          response = await openai.beta.threads.runs.retrieve(thread_id, run_id);
          tries += 1;
      }
      if (response.status === "requires_action") {
          get_and_run_tool(response);
      }

      if (response.status == "completed" || response.status == "failed") {

      }
      
      // await openai.beta.threads.del(thread_id)
      return
  }
  catch (error) {
      console.log(error);
      return error;
  }
}
// write ./whisper post 
const upload = multer({ storage: multer.memoryStorage() });

app.post('/whisper', upload.single('audio'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    };
    try {
        const formData = new FormData();
        formData.append('file', req.file.buffer, req.file.originalname);
        //fs.writeFileSync('test.wav', req.file.buffer);
        
        const name = "test.wav";
        const convertedFile = await toFile(Readable.from(req.file.buffer), name);
        const transciption = await openai.audio.translations.create({
            //file: fs.createReadStream('test.wav'),
            file: convertedFile,
            model: 'whisper-1',
        });
        const data = transciption.text;
        console.log('Transcription:', data)
        res.status(200).send(data);
        
    } catch (error) {
        console.error('Failed to send audio to Whisper:', error);
        res.status(500).send('Failed to process audio');
    }
});


app.listen(3000, function () {
  console.log('App is listening on port 3000!');
});
