import axios from 'axios'

export async function getApiKey (apiKeyStr, philApiUrl) {
  try {
    const res = await axios.post(philApiUrl, {
      query: `query ApiKey($secretKey: String) { 
        apiKey(secretKey: $secretKey) { orgId }
      }`,
      variables: { secretKey: apiKeyStr }
    })
    return res.data.data.apiKey
  } catch (err) {
    console.log(err.response.data)
    return null
  }
}
