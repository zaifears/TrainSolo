import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

export default {
    port: process.env.PORT || 5000,
    shohoz_base_api:
        process.env.SHOHOZ_BASE_API ||
        'https://railspaapi.shohoz.com/v1.0/web',
    client_url: process.env.CLIENT_URL || 'http://localhost:5000',
};
