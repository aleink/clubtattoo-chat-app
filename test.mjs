import { Configuration, OpenAIApi } from 'openai';

console.log('OpenAI ESM import worked!');

const config = new Configuration({ apiKey: 'test' });
const openai = new OpenAIApi(config);

console.log('Configuration and OpenAIApi instantiated!');
