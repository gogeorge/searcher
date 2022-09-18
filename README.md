# searcher
An advanced CTRL+F chrome extension

Searcher is a more advanced version of the native "text finder" / Ctrl+F of Chrome's browser. It can be useful if you want to perform more complicated searches on a webpage, such as regular expressions, lexical distance between two words, word sizes etc.

## Download and Installation

Download the "web-ext" folder from this repository and follow [these instructions](https://webkul.com/blog/how-to-install-the-unpacked-extension-in-chrome/) on how to load the extension on Chrome. These steps need to be followed because at the moment this web extension is not available in the Chrome Web Store.


| Features | Usage |
| ------------- | ------------- |
|```Find```| Finds the word or phrase that has been inputted (case-sensitive) |
|```Word Distance```| Takes two inputted words or phrases and will find the occurrence where these two words are the closest to each other |
|```RegExp```| Takes a regular expression as input E.g. <br><br>  ```/\bthe\b/``` will find all instances of the word "the" <br><br> ```/\bthe\b/i``` will include the instances where the word "the" is written in capitals <br><br> ```/\bthe\b/ig``` will include capital letter and give the count the number of times the word "the" appears in the webpage |
|```Word Size```| Takes a number as an input and looks for all the words with that number of characters |
|```Find Email```| Finds all emails on a webpage (Not fully working at the moment |

## License

This repository is under the MIT License



