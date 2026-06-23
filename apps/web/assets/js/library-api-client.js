class LibraryApi {
  constructor(apiUrl) { this.apiUrl=String(apiUrl||"").replace(/\/$/,""); this.tokenKey="library.sessionToken"; }
  get token(){ return localStorage.getItem(this.tokenKey)||""; }
  set token(value){ value?localStorage.setItem(this.tokenKey,value):localStorage.removeItem(this.tokenKey); }
  async request(path,options={}){
    if(!this.apiUrl||this.apiUrl.includes("YOUR_SUBDOMAIN")) throw new Error("API не настроен.");
    const response=await fetch(`${this.apiUrl}${path}`,{...options,headers:{"Content-Type":"application/json",...(options.headers||{}),...(this.token?{Authorization:`Bearer ${this.token}`}:{})}});
    const payload=await response.json().catch(()=>({}));
    if(response.status===401&&this.token){this.token="";window.dispatchEvent(new Event("auth-expired"));}
    if(!response.ok)throw new Error(payload.error||`Ошибка API: ${response.status}`);return payload;
  }
  get(path){return this.request(path);}
  send(path,method,body){return this.request(path,{method,body:body===undefined?undefined:JSON.stringify(body)});}
  async register(data){const r=await this.send("/api/auth/register","POST",data);this.token=r.token;return r;}
  async login(data){const r=await this.send("/api/auth/login","POST",data);this.token=r.token;return r;}
  async logout(){try{await this.send("/api/auth/logout","POST");}finally{this.token="";}}
  me(){return this.get("/api/auth/me");} loadLibrary(){return this.get("/api/library");}
  title(id){return this.get(`/api/titles/${encodeURIComponent(id)}`);} profile(){return this.get("/api/profile");}
  collections(){return this.get("/api/collections");}
  addToCollection(id,name){return this.send(`/api/titles/${encodeURIComponent(id)}/collections`,"POST",{name});}
  removeFromCollection(titleId,collectionId){return this.send(`/api/titles/${encodeURIComponent(titleId)}/collections/${encodeURIComponent(collectionId)}`,"DELETE");}
  adminOverview(){return this.get("/api/admin/overview");}
  setUserRole(id,role){return this.send(`/api/admin/users/${encodeURIComponent(id)}/role`,"PUT",{role});}
  moderateReview(id){return this.send(`/api/admin/reviews/${encodeURIComponent(id)}`,"DELETE");}
  status(id,status){return this.send(`/api/titles/${encodeURIComponent(id)}/status`,"PUT",{status});}
  readDate(id,readDate){return this.send(`/api/titles/${encodeURIComponent(id)}/read-date`,"PUT",{readDate});}
  rating(id,rating){return this.send(`/api/titles/${encodeURIComponent(id)}/rating`,"PUT",{rating});}
  transaction(id,data){return this.send(`/api/titles/${encodeURIComponent(id)}/transactions`,"POST",data);}
  deleteTransaction(id){return this.send(`/api/transactions/${encodeURIComponent(id)}`,"DELETE");}
  review(id,data){return this.send(`/api/titles/${encodeURIComponent(id)}/review`,"PUT",data);}
  deleteReview(id){return this.send(`/api/titles/${encodeURIComponent(id)}/review`,"DELETE");}
  saveCurrency(currency){return this.send("/api/settings","PUT",{currency});}
  saveItem(item){return this.send("/api/items","PUT",item);} deleteItem(id){return this.send(`/api/items/${encodeURIComponent(id)}`,"DELETE");}
  replaceLibrary(data){return this.send("/api/library","PUT",data);}
}
window.libraryApi=new LibraryApi(window.LIBRARY_CONFIG?.apiUrl);
