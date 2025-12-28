require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.post('/forms', async (req, res) => {
    const {name, summary, baseQuestions} = req.body;
    const {data, error} = await supabase.from('Forms').insert({name, summary, baseQuestions}).select().single();
        if (error) {
            console.log(error)
            return res.status(500).json({error: error.message});
        }       
    res.json({form:data}); 
});


app.get("/forms", async (req, res) => {
    const {data, error} = await supabase.from('Forms').select('ID, name, summary, baseQuestions');
    if (error) {
        return res.status(500).json({error: error.message});
    }
    res.json({forms:data});
});

app.get("/forms/:id", async (req, res) => { 
    const { id } = req.params;
    const {data, error} = await supabase.from('Forms').select('ID, name, summary, baseQuestions').eq("ID", id).single();
    if (error) {
        console.log("it doesnt work: ", error)
        return res.status(500).json({error: error.message});
    }
    res.json({forms:data});

})


app.post('/forms/:id', async (req, res) => {
    const {formid, answers} = req.body;
    const {data, error} = await supabase.from('Responses').insert({ formid, answers}).select().single();
        if (error) {
            console.log(error)
            return res.status(500).json({error: error.message});
        }       
    res.json({form:data}); 
    console.log("we good")
});

app.listen(5001)