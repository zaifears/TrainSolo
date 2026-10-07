import axios from 'axios';
import config from '../config';

const axiosInstance = axios.create();
axiosInstance.defaults.headers.post['Content-Type'] = 'application/json';
axiosInstance.defaults.headers['Accept'] = 'application/json';
axiosInstance.defaults.headers['User-Agent'] =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
axiosInstance.defaults.headers['Origin'] = 'https://eticket.railway.gov.bd';
axiosInstance.defaults.headers['Referer'] = 'https://eticket.railway.gov.bd/';
axiosInstance.defaults.headers['Accept-Language'] = 'en-US,en;q=0.9,bn;q=0.8';
axiosInstance.defaults.timeout = 60000;
axiosInstance.defaults.baseURL = config.shohoz_base_api;

export default axiosInstance;
