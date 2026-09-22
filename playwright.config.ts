import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',fullyParallel:false,use:{baseURL:process.env.TMM_TEST_URL||'http://127.0.0.1:3000',...devices['Desktop Chrome']},reporter:'list'});
