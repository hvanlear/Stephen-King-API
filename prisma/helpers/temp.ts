import { books } from "../bookData";
import { shorts } from "../shortsData";
import { villains } from "../vData";
import prisma from "../../src/db";


//checks for any non string values in the notes array
const  main = async() => {
    const v = villains;

    for(let i =0; i< villains.length; i++){
        for(let j=0; j <villains[i].notes.length; j++){
            if(typeof villains[i].notes[j] !== 'string'){
            console.log(villains[i].name)
        }
        
    }
}
}
main()