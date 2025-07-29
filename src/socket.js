// socket.js
import { io } from "socket.io-client";
// const url = 'http://192.168.31.89:5000/'
// const url = "http://10.74.173.210:5000"
const url = "https://socketserver-8it3.onrender.com/"

export const socket = io(url || window.location.origin);
