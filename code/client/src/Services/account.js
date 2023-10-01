export const accountUpdate = async (id) => {
  const response = await fetch(`/account-update/${id}`, {
    method: "get",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    console.log(response);
    console.log("Account Update: Error happened while fetching data");
    return null;
  }
  const data = await response.json();
  return data;
};
