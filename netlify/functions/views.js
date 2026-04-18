exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      return { statusCode: 200, headers, body: JSON.stringify({ count: 0 }) };
    }

    if (event.httpMethod === 'POST') {
      // Increment and return new value
      const res = await fetch(`${url}/incr/profile_views`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify({ count: data.result }) };
    }

    if (event.httpMethod === 'GET') {
      const res = await fetch(`${url}/get/profile_views`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      return { statusCode: 200, headers, body: JSON.stringify({ count: data.result || 0 }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
