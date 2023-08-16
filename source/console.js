
export function console_init() {
	
	let console_log = console.log
	console.log = function() {
		console_log(...arguments)
		console_write(...arguments)
	}
}

function console_write() {
	
	var div = document.createElement('div')
	div.style.cssText = 'font-family:mono;font-size:75%'
	let message = arguments[0]
	message = message.replaceAll(' ', '&nbsp;')
	message = message.replaceAll('\n', '<br>')
	div.innerHTML = message
	document.body.appendChild(div)
}
