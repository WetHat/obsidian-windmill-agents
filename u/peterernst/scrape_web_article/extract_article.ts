// import * as wmill from "windmill-client"

export async function main(status: number, response: string) {

  const json = JSON.parse(response);

  return {
    status,
    html: json.data[0].results[0].html
  }
}
