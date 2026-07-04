var inputTag = document.getElementById('search')
	textTag = document.getElementById('text')
	btn = document.getElementById('btn')
	select = document.getElementById('options')
	marks = document.getElementsByClassName('marks') 
	prevBtn = document.getElementById('prevBtn')
	nextBtn = document.getElementById('nextBtn')
	position = document.getElementById('position')
	selectBtn = document.getElementById('selectBtn') 

// temp
// inputTag.value = '/[0-9]/g'
inputTag.value = 'and'
select.value = 'find'
// add a regex option
inputTag.addEventListener('keyup', function(e) {
	input = inputTag.value
	text = textTag.innerHTML
	if (select.value == 'find' && e.keyCode == 13) {
		find(input)
		prevBtn.style.visibility = 'visible'
		nextBtn.style.visibility = 'visible'

	}
	else if (select.value == 'wordDistance' && e.keyCode == 13) {
		wordDistance(input.split(' ')[0], input.split(' ')[1])

	}
	else if (select.value == 'regex' && e.keyCode == 13) {
		//let regex = input.substring(7)
		regex(input)
	}
	else if (e.keyCode == 8 && text.includes('<mark')) {
		console.log('backspace')
		removeMark(text)
	}
	else {
		console.log('the word was not found')
	}
})

function find(str) {
	let textArray = textTag.innerHTML.split(' ')
		occurrences = text.match(new RegExp('\\b' + input + '\\b', 'g')).length
		stringLocation = []
	//  console.log('the word ' + input + ' was found in the text ' + occurrences + ' time(s)')
	for (i = 0; i < textArray.length; i++) {
		// the if statement needs to be more sophisticated
		if (textArray[i] == str) {
			stringLocation.push(i)
			textArray[i] = "<mark class='marks'>" + textArray[i] + "</mark>"
		}
	}
	textTag.innerHTML = textArray.join(' ')
}

// this is a function that needs to be implemented for all the three modes
function wordDistance(word1, word2) {
	let word1Location = []
		word2Location = []
		shortestWordDistance = []
		textArray = textTag.innerHTML.split(' ')
	for (i = 0; i < textArray.length; i++) {
		if (textArray[i] == word1) {
			word1Location.push(i)
		} 
		else if (textArray[i] == word2) {
			word2Location.push(i)
		}
	} 

	let lowestDistance
		closestWordsIndex = []
	for (i = 0; i < word1Location.length; i++) {
		for (j = 0; j < word2Location.length; j++) {
			let distance = Math.abs(word1Location[i] - word2Location[j])
			// console.log('min: ' + Math.min(...shortestWordDistance))

			if (distance < Math.min(...shortestWordDistance)) {
				lowestDistance = distance
				closestWordsIndex[0] = word1Location[i]
				closestWordsIndex[1] = word2Location[j]
				// console.log('current lowest distance: ' + lowestDistance)
			}
			shortestWordDistance.push(distance)
			// console.log("distance between '" + textArray[word1Location[i]] + "' and '" + textArray[word2Location[j]] + "' is " + shortestWordDistance[i])
		}
	}
   
	console.log('word1 index: ' + textArray[closestWordsIndex[0]])
	console.log('word2 index: ' + textArray[closestWordsIndex[1]])   
	console.log("the fucking lowest word-distance: " + lowestDistance)

	// remove the mark tags when the backspace is pressed
	textArray[closestWordsIndex[0]] = "<mark class='marks'>" + textArray[closestWordsIndex[0]] + "</mark>"
	textArray[closestWordsIndex[1]] = "<mark class='marks'>" + textArray[closestWordsIndex[1]] + "</mark>"
	textTag.innerHTML = textArray.join(' ')
}
// sorry for the eval() but idgaf
function regex(str) {
	let regexStr = str.replace(/^"(.*)"$/, '$1')
	console.log(regexStr)
	if (eval("text.match(" + regexStr + ")")) {
		console.log('regex has worked')
		// remove double quotes from the string
		// let foundChars = eval("(" + text.match(" + regexStr + ") + ")")
		let foundChars = eval("(function() {" + text.match(" + regexStr + ") + "\n}())")
		    foundChars = foundChars.substring(0, 5)
		console.log(foundChars)
			// foundArray = foundChars.split(",")
		console.log('match: ' + foundChars)
		// console.log(foundArray)
		// HIGHLIHGHT THE WORD
	} else {
		console.log('regex has found no cases') 
	}
}


// second tier importance functions

function removeMark(text) {
	var occurrences = text.match(new RegExp('<mark', 'g')).length
	for (i = 0; i < occurrences; i++) {
		marks[i].style.backgroundColor = 'transparent'
	}
}
var counter = 0
prevBtn.onclick = function() {
	let text = textTag.innerHTML
		occurrences = text.match(new RegExp('<mark', 'g')).length
		marks = document.getElementsByClassName('marks')
		coord = marks[counter].getBoundingClientRect()
		h = window.innerHeight
	if (text.includes('<mark') && counter > 0) {
		if (coord.top > h) {
			window.scrollTo(0, coord.top - h/2)
		}
		marks[counter-2].style.opacity = '1'
		marks[counter-1].style.opacity = '0.7'
		counter--
		console.log(counter)
		position.innerHTML = counter + '/' + occurrences
	}
	// if the word is not within the screen, then this function should scroll until the word is visible
}

nextBtn.onclick = function() {
	let text = textTag.innerHTML
		occurrences = text.match(new RegExp('<mark', 'g')).length
		marks = document.getElementsByClassName('marks')
		coord = marks[counter].getBoundingClientRect()
		h = window.innerHeight

	if (text.includes('<mark') && counter != occurrences) {
		if (coord.top > h) {
			window.scrollTo(0, coord.top - h/2)
		}
		marks[counter].style.opacity = '1'
		if (counter > 0) marks[counter-1].style.opacity = '0.7'
		counter++
		position.innerHTML = counter + '/' + occurrences
	}
	// if the word is not within the screen, then this function should scroll until the word is visible
}

// select words

function selectText() {
	console.log('pass 2')
    var txt = ''
    if (window.getSelection) {
        txt = window.getSelection()
    }
    else if (document.getSelection) {
        txt = document.getSelection()
    }
    else if (document.selection) {
        txt = document.selection.createRange().text
    }
    else {
    	return document.aform.selectedtext.value = txt
    }
    console.log('selected text: ' + txt)
}

selectBtn.onclick = function() {
	let textArray = window.getSelection().toString().split(' ')
	//  console.log('the word ' + input + ' was found in the text ' + occurrences + ' time(s)')
	for (i = 0; i < textArray.length; i++) {
		// the if statement needs to be more sophisticated
		if (textArray[i] == inputTag.value) {
			textArray[i] = "<mark class='marks'>" + textArray[i] + "</mark>"
		}
	}
	textTag.innerHTML = textArray.join(' ')
}