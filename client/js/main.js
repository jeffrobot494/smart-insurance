class App {
    constructor(){
        console.log("Hello world!");
    }
}

//create app on dom loadded
document.addEventListener('DOMContentLoaded', ()=>{
    new App();
});